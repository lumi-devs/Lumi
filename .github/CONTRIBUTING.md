# Contents
* [1. Introduction](#1-introduction)
  * [1.1 Why do these guidelines exist?](#11-why-do-these-guidelines-exist)
  * [1.2 What kinds of contributions are we looking for?](#12-what-kinds-of-contributions-are-we-looking-for)
* [2. Ground Rules](#2-ground-rules)
* [3. Getting Started](#3-getting-started)
  * [3.1 Setting up your development environment](#31-setting-up-your-development-environment)
  * [3.2 Testing & Style](#32-testing--style)
  * [3.3 To contribute changes](#33-to-contribute-changes)
* [4. Code Review Process](#4-code-review-process)

# 1. Introduction
**Welcome!** First off, thank you for contributing to the further development of Lumi. We're always looking for new ways to improve our project and we appreciate any help you can give us.

### 1.1 Why do these guidelines exist?
Lumi is an open source project. By following these guidelines you will help the developers streamline the contribution process and save them time, ensuring we can review your work promptly.

### 1.2 What kinds of contributions are we looking for?
We love receiving contributions from our community. Any assistance you can provide with regards to bug fixes, feature enhancements, and documentation is more than welcome.

# 2. Ground Rules
1. Ensure all TypeScript features used in contributions exist and work with our configured target environments.
2. Create new tests for code you add or bugs you fix.
3. Don't add new major modules unless specifically given approval in an issue discussing said idea.
4. Be welcoming to newcomers and encourage diverse new contributors from all backgrounds.

# 3. Getting Started

### 3.1 Setting up your development environment
The following requirements must be installed prior to setting up:
 - [Bun](https://bun.sh) (v1.1 or greater)
 - PostgreSQL 16
 - Redis 7
 - git

1. Fork and clone the repository to a directory on your local machine.
2. Open a command line in that directory and execute:
    ```bash
    bun install
    ```
    This will install all necessary dependencies across the monorepo workspaces.

3. Push the database schema:
    ```bash
    bun run db:generate
    bun run db:push
    ```

4. Run the bot in development mode:
    ```bash
    bun run dev
    ```

### 3.2 Testing & Style
Lumi uses standard modern tooling (like Prettier and ESLint) to ensure code style and quality. 
Before submitting a PR, make sure your code passes linting:
```bash
bun run lint
```
And ensure your tests pass:
```bash
bun test
```

### 3.3 To contribute changes
1. Create a new branch on your fork.
2. Make the changes.
3. Run tests and linting to ensure your code is up to scratch.
4. Create a Pull Request on GitHub with your changes.

# 4. Code Review Process
Pull requests are evaluated by their quality and how effectively they solve their corresponding issue. 
Our core team will review and test the pull request, generally within a few days. Feedback will be provided directly on the pull request.
