# JSON lab answers

## Checkpoint 1
data types in assistant-profile.json:

```
student_name: string
grade_level: number
favorite_subject: string
uses_voice_mode: boolean
daily_study_minutes: number
```

## Checkpoint 2
Did jq change the meaning? no. It's the same exact data.

What did it change? Just the spacing. It added line breaks and indents so it's not all on one line.

Why is pretty easier to read? Because everything is formatted and you could find relative datas faster.

## Checkpoint 3
Why would an api send compact json? It's smaller so it sends faster and uses less data.

Is compact different data or just formatting? Just formatting, same data.

Which would I rather debug? Pretty. Compact is very hard to read for humans.

## Checkpoint 4
What does [0] mean? It grabs the first thing in the array (calendar, last command, etc).

Why isn't the first one [1]? Arrays start counting at 0, instead of 1.

command for the second tool:
```
jq '.favorite_tools[1]' assistant-profile.json
```

## Checkpoint 5
Difference between `jq .student_name` and `jq -r .student_name`?
- normal one keeps the quotes so "Sho"
- -r strips the quote so it becomes Sho

Why is raw useful in a script? 
Because you usually just want the plain text to put in a variable, not with the quotes.

## Checkpoint 6
What is nesting? 
Putting an object or array inside another object as a value, creating structure within structure. 

Why does `.preferences.response_style` have two names with a dot? 
Because `response_style` is inside preferences. first name gets you into preferences, second gets the actual field.

command for just max_answer_length:
```
jq .preferences.max_answer_length assistant-profile.json
```

## Checkpoint 7
Which mistake gave you the clearest error message?
Removing a comma or a colon, because jq tells almost exactly to where the problem is.

Which mistake gave you the most confusing error message?
Forgetting a closing symbol, because the error appears at the like "unexpected end of file" which I didn't know it would say this and does not specify where the missing symbol is.

Why do computers reject JSON that humans can still sort of understand?
A Computer follows strict, exact rules and cannot guess what you meant like AI does. Any deviation from the format is rejected to avoid misreading the data.

## Checkpoint 8
what does my robot json describe? 
The current status of a robot like its ID, battery level, locaiton etc.

Which fields are strings?
robot_id, current_location, last_command_received

Which fields are numbers?
battery_percentage, and the sensor reading values

Which fields are booleans?
online

Where did you use an array?
The list of active tasks.

Where did you use nesting?
The sensor readings object inside the main object.

Which file is easier to read: robot-status.json, robot-status-pretty.json, or robot-status-compact.json?
robot-status-pretty.json

Which file looks most like what might be sent across a network?
robot-status-compact.json

## optional stretch (classroom.json, classroom-compact.json and classroom-pretty.json.)
made a classroom with a class name, room, teacher, student count and a list of teams. each team has a name, members, project idea and needs_help.