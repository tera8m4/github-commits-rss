// app.ts
import express from 'express';
import RSS from 'rss';
import * as sqlite from 'node:sqlite';
import sqlite3 from 'sqlite3';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define constants and default values
const DEFAULT_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 min
const app = express();
const port = 3000;
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL || DEFAULT_REFRESH_INTERVAL.toString());
const LAST_UPDATE_TIME_KEY = 'last_updated';
const INITIAL_COMMITS_START_DATE = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();

// GitHub Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) throw new Error('GitHub token is required.');
const GITHUB_BRANCH = process.env.GITHUB_BRANCH;
if (!GITHUB_BRANCH) throw new Error('Github branch is required.');
const octokit = new Octokit({ auth: GITHUB_TOKEN });
const GITHUB_REPO = process.env.GITHUB_REPO;
if (!GITHUB_REPO) throw new Error('GitHub repository in owner/repo format is required.');
const [owner, repo] = GITHUB_REPO.split('/');
const FEED_URL = process.env.FEED_URL || `http://localhost:${port}/rss`;


// Database setup using node:sqlite
const db = new sqlite.DatabaseSync('./storage/commits.db', { open: true });

db.exec(`
        CREATE TABLE IF NOT EXISTS commits (
            sha TEXT PRIMARY KEY,
            author TEXT,
            message TEXT,
            url TEXT,
            date DATETIME
        );
        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT
        );`
);

// Function to get the last update time
function getLastUpdateTime(): Date {

    const result = db.prepare('SELECT value FROM metadata WHERE key = ?').get(LAST_UPDATE_TIME_KEY) as any | undefined;
    if (result) {
        return new Date(result.value as string);
    }
    return new Date(0);
}

// Set metadata value
async function dbSetMetadata(key: string, value: string): Promise<void> {
    db.prepare(
        'INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)',
    ).run(key, value);
}

// Fetch and store commits from GitHub
async function fetchAndStoreCommits(): Promise<void> {
    const req = db.prepare('SELECT value FROM metadata WHERE key = ?')
        .get('last_fetched') as any | undefined;

    const lastFetched: string | undefined = req?.value;

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

    // Store commits in the database
    const insert = db.prepare('INSERT OR IGNORE INTO commits VALUES (?, ?, ?, ?, ?)');
    for (const commit of commits) {
        const authorName: string = commit.commit.author ? commit.commit.author.name! : 'Unknown author';
        const commitDate: Date = commit.commit.author?.date ? new Date(commit.commit.author.date) : new Date();

        insert.run(
            commit.sha,
            authorName,
            commit.commit.message,
            commit.html_url,
            commitDate.valueOf()
        );
    }

    // Update last fetched date
    const newestCommitDate = new Date(commits[0].commit.author!.date!);
    await dbSetMetadata('last_fetched', newestCommitDate.toISOString());

    console.log(`Stored ${commits.length} new commits\nthe last commit: ${commits[0].sha}`);
}

// Generate RSS feed
function generateRssFeed(commits: Array<any>): string {
    const feed = new RSS({
        title: `${repo} Commits`,
        description: `Recent commits from ${owner}/${repo}`,
        feed_url: FEED_URL,
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

// RSS route
app.get('/rss', async (req, res) => {
    const lastRefreshTime = getLastUpdateTime();
    const now = Date.now();
    if (now - lastRefreshTime.valueOf() > UPDATE_INTERVAL) {
        console.log(`now: ${now} ## last update_time: ${lastRefreshTime.valueOf()} ## interval ${UPDATE_INTERVAL} `);
        await fetchAndStoreCommits();
        await dbSetMetadata(LAST_UPDATE_TIME_KEY, new Date(now).toISOString());
    }

    const commits = db.prepare('SELECT * FROM commits ORDER BY date DESC LIMIT 300').all();
    res.type('application/rss+xml');
    res.send(generateRssFeed(commits));
});

// Initial setup and server start
function initialize() {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}/rss`);
    });
}

initialize();