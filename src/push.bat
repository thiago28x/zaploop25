@echo off

:: Get current time in HH:MM format
for /f "tokens=1,2 delims=: " %%a in ("%TIME%") do (
    set hour=%%a
    set minute=%%b
)

:: Remove leading space if hour is single digit
set hour=%hour: =%

:: Add leading zero if hour is single digit
if %hour% LSS 10 set hour=0%hour%

set current_time=%hour%:%minute%

:: Add all changes
git add .

:: Commit with current time as message
git commit -m "%current_time%"

:: Push to master branch
git push origin master

:: Print confirmation
echo Changes pushed to master branch with commit message: %current_time%

pause 