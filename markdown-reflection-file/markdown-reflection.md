# Markdown Reflection

I spent this lab learning how to write Markdown source and preview it as rendered output in viewer(FluxMarkdown.app). Writing on multiple lines with blank lines between sections made the file much easier to read and edit.

## What I learned

- Headings use `#`, and more `#` means a smaller heading
- Blank lines separate paragraphs and list blocks
- Inline formatting like `code` uses backticks

## What I tried

1. Created the file with Codex
2. Opened it in Viewer
3. Added each required content
4. Previewed the file with the viewer

## Evidence or examples

Here is a checklist of the elements I included:

- [x] Example
- [ ] Example1

Website I followed:
[Markdown Guide](https://www.markdownguide.org/basic-syntax/).

To create the file I used a command like `touch markdown-reflection.md`.

A code block example:

```bash
cd ~/labs/markdown-reflection-file
ls -la
```

Table example:

| Example | Example |
| ------- | ------- |
| Example | Example |
| Example | Example |

Escaped Character Example
`\# not a heading`
`\*not italic\*`

## What confused me

At first, I did not understand why my list turned into one line. I learned it was because I forgot the blank line before the list.

## Preview Fix

When I previewed the file in my viewer, my table did not render as a table. I realized I
was missing the separator row made of dashes, something like this `| --- | --- |` under the header of the table. After adding that row and previewing again, the table rendered correctly. Also the example of escaped character was missing so I added it.

## Next steps

- Practice writing Markdown without a template
- Learn how to add images
