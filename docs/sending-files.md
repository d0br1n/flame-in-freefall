# Moving files between laptops and the Oracle server

Two scripts in `tools/` move files in both directions over the same `nasa` ssh alias the
swarm uses: no extra port, no extra login.

| Direction | Command | Where it lands |
| --- | --- | --- |
| laptop → server | `tools/send.sh <file-or-dir>...` (on the laptop) | `~/inbox/<sender>/` on the server |
| server → laptop, step 1 | `tools/send.sh <file-or-dir>...` (on the server) | `~/outbox/` on the server |
| server → laptop, step 2 | `tools/get.sh <name>...` (on the laptop) | `from-server/` in your repo |

The server cannot open a connection to a laptop, so it never pushes: it puts files in its
outbox and the laptop pulls them.

## Setup

Nothing new if the swarm already works for you. Otherwise add the server to `~/.ssh/config`
(ask a teammate for the ip and key) and check that `ssh nasa true` runs without a prompt:

```
Host nasa
    HostName <server ip>
    User opc
    IdentityFile ~/.ssh/<your key>
    IdentitiesOnly yes
```

On Windows run the scripts in Git Bash.

## Sending to the server (from a laptop)

```
tools/send.sh data.csv                         # one file
tools/send.sh -m "sample dataset" data/ a.png  # folders and several items, with a note
tools/send.sh -l                               # show the last 20 transfers
```

- Files land in `~/inbox/<sender>/`; `<sender>` is the first word of your git `user.name`,
  lowercased. Override with `SEND_AS=name`.
- Each transfer is one line in `~/inbox/log.tsv` (UTC time, sender, names, note).

## Getting files from the server (on a laptop)

```
tools/get.sh -l                        # what is in the server outbox
tools/get.sh model.pkl                 # one item from the outbox
tools/get.sh -a                        # everything in the outbox
tools/get.sh nasa-hackathon/data/raw   # any path under the server home, no sharing needed
tools/get.sh -o data/raw -a            # save somewhere other than from-server/
```

- A name is looked up in `~/outbox/` first, then as a path relative to the server home,
  then as an absolute path.
- Fetched files go to `from-server/` at the repo root, which is gitignored.

## Sharing from the server

On the server, the same `tools/send.sh [-m "note"] <file-or-dir>...` copies into `~/outbox/`
and logs to `~/outbox/log.tsv`. It knows it is on the server from the `~/.nasa-hub` marker
file. Ask the Claude session on the server to "send me X" and then run `tools/get.sh X`.

## The second server (nasa2)

`nasa2` is the team's second Oracle server, used for extra compute. Reach it from any laptop
where `ssh nasa true` works. You need no new key or ip, because the hop goes through the hub:

```
tools/nasa2.sh                          # interactive shell on nasa2
tools/nasa2.sh nproc                    # run one command there
tools/nasa2.sh -c 'cd nasa-hackathon && git log -1 --oneline'   # a shell line
tools/nasa2.sh -c 'cat > notes.txt' < notes.txt                 # copy a small file over
```

The repo is at `~/nasa-hackathon` on nasa2, as on the hub. For large files, send them to the
hub with `send.sh` and copy them from there with `ssh nasa2` (run on the hub).

## Good to know

- Same name = overwrite, in both directions. Folders stay folders.
- Nothing is announced automatically. Tell the receiver what you sent (the Claude sessions
  use one `swarm.sh say` line for this).
- `send.sh` uses `rsync` when the laptop has it (resumes large files, shows progress) and
  `scp` otherwise. `get.sh` streams a compressed tar over ssh.
- `cannot reach nasa` means `ssh nasa true` is failing: fix the ssh config first.
- Do not send keys or `.env` files.
- The rules the Claude sessions follow are in `.claude/skills/files/SKILL.md`.
