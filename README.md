# GitHub Commits RSS Feed

This project is a Node.js application that fetches recent commits from a specified GitHub repository and serves them as an RSS feed. It utilizes Express for the server, SQLite for the local database, and the Octokit REST library to interact with the GitHub API.

## Features
- Fetches commits from a specified GitHub repository.
- Stores commit information in a local SQLite database.
- Provides an RSS feed of the latest commits.
- Configurable refresh interval for fetching new commits.

## Requirements
- Node.js (version 14 or higher recommended)
- Yarn (for dependency management)
- A GitHub account with a Personal Access Token

## Getting Started

### Prerequisites
1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Install dependencies**
   Install Yarn if you haven't already:
   ```bash
   npm install --global yarn
   ```

### Environment Variables
Create a `.env` file in the root of the project and add the following variables:
```plaintext
PORT=3000
GITHUB_TOKEN=<your_github_token>
GITHUB_BRANCH=<branch_name>
GITHUB_REPO=<owner/repo>
UPDATE_INTERVAL=1800000  # Optional, in milliseconds (default is 30 minutes)
```

### Running the Application Locally
1. **Install dependencies**
   ```bash
   yarn install
   ```

2. **Compile TypeScript to JavaScript**
   ```bash
   yarn build
   ```

3. **Run the application**
   ```bash
   node dist/app.js
   ```

The server will run at `http://localhost:3000/rss`.

### Running with Docker
1. **Build the Docker image**
   ```bash
   docker build -t github-commits-rss .
   ```

2. **Run the Docker container**
   ```bash
   docker run -p 3000:3000 --env-file .env github-commits-rss
   ```

## Usage
After starting the server, you can access the RSS feed at: