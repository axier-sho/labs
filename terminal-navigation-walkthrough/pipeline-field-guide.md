# Unix Pipelines Field Guide

## What Is a Pipeline?

A pipeline connects two or more commands so that the output of one command becomes the input of the next. The pipe operator `|` is what links them together. Instead of saving a result to a file and then opening it with another command, I can send the data straight through.

Many Unix commands do only a small amount of job so for example, sort only sorts, and grep only searches. We could combine 2 commands into 1 line of command to increase the efficiency of your work.

## Pipeline Examples
### Example 1: Count the files in my folder
```
ls | wc -l
```
- `ls` lists the files in the folder.
- `wc -l` counts the lines it gets.
- Result: 7   
- When to use: To quickly count items in a folder.

### Example 2: Find Markdown files
```
ls | grep ".md"
```
- `ls` lists the files.
- `grep ".md"` keeps only the lines with ".md".
- Result: reflection.md, pipeline-field-guide.md
- When to use: To find one type of file in a folder.

### Example 3: List files in order, then keep the top 3
```
ls | sort | head 3
```
- `ls` lists the files.
- `sort` puts them in alphabetical order.
- `head 3` keeps only the first 3.
- Result: allah.mov, banana.md, couch.png
- When to use: To preview the first few files neatly.

### Example 4: Count words in a file I made
```
cat lab-files.txt | wc -w
```
- `cat lab-files.txt` prints the file's contents.
- `wc -w` counts the words.
- Result: 24   
- When to use: To get a quick word count of a file.

### Example 5: Find a word in a file, then count the matches
```
cat reflection.md | grep "lab" | wc -l
```
- `cat reflection.md` prints the file.
- `grep "lab"` keeps only lines containing "lab".
- `wc -l` counts those lines.
- Result: 3   
- When to use: To count how many times something appears in a file.

## What I Understand Now

**Which pipeline was most useful?**
Example 1 (`ls | wc -l`) was the most useful because it instantly told me how many files were in my folder without me having to count them by hand.

**Which command was hardest to understand?**
`grep` was the hardest at first, because I had to learn how to give it the right text to search for.

**What changed when you added a second pipe?**
The second pipe let me work on the data twice. For example, first I filtered it, and then you can count the result again.

**How is `|` different from `>`?**
The pipe `|` sends a command's output into another command so it can being processed on the next command. The `>` writes output into a file and stops there, so nothing else happens to the data.(just writing)

**One pipeline I could imagine using in a real project:**
`cat log.txt | grep "ERROR" | wc -l`
This would count how many error messages are in a log file, which would help me quickly check if something went wrong in a program.