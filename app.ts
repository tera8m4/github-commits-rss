// app.ts
import express from 'express';
import RSS from 'rss';
import sqlite3 from 'sqlite3';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
// Define an interface for the row expected from the metadata table
interface MetadataRow {
    value: string;
}
// Load environment variables
dotenv.config();

const DEFAULT_REFRESH_INTERVAL = 30 * 60 * 1000; // 30min
const app = express();
const port = process.env.PORT || 3000;
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL || DEFAULT_REFRESH_INTERVAL.toString());
const LAST_UPDATE_TIME_KEY = 'last_updated';
const INITIAL_COMMITS_START_DATE = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();

// GitHub Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) throw new Error('GitHub token is required.');
const GITHUB_BRANCH = process.env.GITHUB_BRANCH;
if (!GITHUB_BRANCH) throw new Error('Github branch is required.');
const octokit = new Octokit({
    auth: GITHUB_TOKEN,
});
const GITHUB_REPO = process.env.GITHUB_REPO;
if (!GITHUB_REPO) throw new Error('GitHub repository in owner/repo format is required.');
const [owner, repo] = GITHUB_REPO.split('/');

// Database setup
const db = new sqlite3.Database('./commits.db', (err) => {
    if (err) console.error('Database connection error:', err);
});

db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS commits (
      sha TEXT PRIMARY KEY,
      author TEXT,
      message TEXT,
      url TEXT,
      date DATETIME
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
});

async function getLastUpdateTime(): Promise<Date> {
    const lastTime: string | undefined = await dbGetMetadata(LAST_UPDATE_TIME_KEY);
    if (lastTime) {
        return new Date(lastTime);
    }

    return new Date(0);
}

// Get or set metadata value
function dbGetMetadata(key: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT value FROM metadata WHERE key = ?',
            [key],
            (err, row: MetadataRow | undefined) => err ? reject(err) : resolve(row?.value)
        );
    });
}

function dbSetMetadata(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
            [key, value],
            err => err ? reject(err) : resolve()
        );
    });
}

// Fetch and store commits
async function fetchAndStoreCommits(): Promise<void> {
    try {
        const lastFetched: string | undefined = await dbGetMetadata('last_fetched');
        const options = {
            owner,
            repo,
            sha: GITHUB_BRANCH,
            per_page: 100, // Max allowed by GitHub
            since: lastFetched || INITIAL_COMMITS_START_DATE,
        };

        // Fetch all pages of commits
        const commits = await octokit.paginate(
            octokit.repos.listCommits,
            options,
            (response) => response.data
        );

        if (commits.length === 0) {
            console.log('No new commits');
            return;
        }

        // Store commits
        const stmt = db.prepare('INSERT OR IGNORE INTO commits VALUES (?, ?, ?, ?, ?)');
        for (const commit of commits) {
            const authorName = commit.commit.author ? commit.commit.author.name : 'Unknown author';
            const commitDate = commit.commit.author?.date ? new Date(commit.commit.author.date) : new Date();


            stmt.run(
                commit.sha,
                authorName,
                commit.commit.message,
                commit.html_url,
                commitDate
            );
        }
        stmt.finalize();

        // Update last fetched date to the newest commit's date
        const newestCommitDate = new Date(commits[0].commit.author!.date!);
        await dbSetMetadata('last_fetched', newestCommitDate.toISOString());

        console.log(`Stored ${commits.length} new commits\nthe last commit: ${commits[0].sha}`);
    } catch (error) {
        console.error('Error fetching commits:', (error as Error).message);
    }
}

// Generate RSS feed
function generateRssFeed(commits: Array<any>): string {
    const feed = new RSS({
        title: `${repo} Commits`,
        description: `Recent commits from ${owner}/${repo}`,
        feed_url: `http://localhost:${port}/rss`,
        site_url: `https://github.com/${owner}/${repo}`,
    });

    commits.forEach(commit => {
        feed.item({
            title: commit.message.split('\n')[0],
            description: commit.message,
            url: commit.url,
            author: commit.author,
            date: commit.date,
        });
    });

    return feed.xml();
}

// Routes
app.get('/rss', async (req, res) => {
    const lastRefreshTime = await getLastUpdateTime();
    const now = Date.now();
    if (now - lastRefreshTime.valueOf() > UPDATE_INTERVAL) {
        console.log(`now: ${now} ## last update_time: ${lastRefreshTime.valueOf()} ## inverval ${UPDATE_INTERVAL} `);
        await fetchAndStoreCommits();
        await dbSetMetadata(LAST_UPDATE_TIME_KEY, new Date(now).toISOString());
    }
    db.all('SELECT * FROM commits ORDER BY date DESC LIMIT 100', (err, commits) => {
        if (err) {
            res.status(500).send('Error retrieving commits');
            return;
        }
        res.type('application/rss+xml');
        res.send(generateRssFeed(commits));
    });
});

// Initial setup and scheduling
async function initialize() {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}/rss`);
    });
}

initialize();