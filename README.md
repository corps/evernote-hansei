# evernote-hansei

Little script to surface random digests of notes from your evernote.

## Usage

Create a developer token [here](https://www.evernote.com/api/DeveloperToken.action)

Then,

```
npm install evernote-hansei -g
hansei -h
hansei -t myevernotetoken -n "My notebook,Study Notebook" -d 7
```

Settings are stored in `~/.hansei-config.json`.

## What does it do?

On the first run, evernote will create a new notebook called "Hansei".

On that run, and all future runs, it will simply "fill" up to the
set digest size a number of randomly selected notes from the notebooks specified
on the command line.  You can delete the notes from Hansei or mark them as
complete to have them replaced on the next run.

An ideal setup involves running the script on a timer via cron or systemd.
