# Personal Tracker

Personal Tracker is a personal website I made to keep the things I use every day in one place. It started as a project for myself, so parts of it reflect my routines and tastes. You can use it as it is, or change what doesn't fit.

It helps me keep track of belongings, plan dates and tasks, manage expenses, and organize games, books, films, and music. There's a private journal for dreams and notes, local weather and ground estimates, and a place to follow news and practice languages. The home screen puts the information I check most often together. Its colors can change with the weather, time of day, and moon phase. There's also an optional Wallpaper Engine version for the desktop.

The site works offline for many everyday tasks. Data stays in your browser unless you choose to connect Supabase, which lets you sign in and sync between devices. With a private Storage bucket, you can also keep copies of game saves and configuration files. Some features, such as live weather and news, still need an internet connection.

The code is public, but my personal data isn't part of the repository. If you want your own copy, fork the project and host it on GitHub Pages or another static web host. You can create a separate Supabase project, run the included database setup, and use your own project URL and publishable key. Your records then belong to your installation, not mine. You can also skip Supabase and use the local-only mode.

The full instructions are in [SETUP.md](SETUP.md). Start with `config.example.js` if you're connecting your own Supabase project, run `supabase/schema.sql` for the database, and run `supabase/game-backups.sql` if you want private file backups. Check that Row Level Security and Storage access policies are enabled before putting personal information online. Never publish a Supabase secret or service-role key, private backup, or password. The journal's four-digit PIN isn't strong enough to protect highly sensitive secrets against someone who gets a copy of its encrypted data.

The app uses plain HTML, CSS, and JavaScript modules. No build step is needed to serve the website. For local testing, run `python -m http.server 8080` from the repository folder and open `http://localhost:8080`. Run `node --test` to check the JavaScript tests. The separate Wallpaper Engine files can be rebuilt with `node scripts/build-wallpaper.mjs`.
