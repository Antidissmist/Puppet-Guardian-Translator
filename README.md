# Puppet Guardian Translator

A Tampermonkey userscript that translates Japanese text inside the game Puppet Guardian!

## Features
- Automatically finds Japanese text and quickly translates it into English as you play!
- Caches important text and item names, so most text you've seen before will be seamlessly replaced.
<img width="210" height="163" alt="inspect1" src="https://github.com/user-attachments/assets/843c2b27-46f5-4bcc-8d4c-ae38d73418bc" />


- Buttons to translate English text into Japanese, for the chat and other text inputs.
<img width="552" height="64" alt="chat1" src="https://github.com/user-attachments/assets/9658faa3-e103-4872-85d1-efed71c2f2c1" />
<img width="553" height="66" alt="chat2" src="https://github.com/user-attachments/assets/9d7b2293-ddc4-4706-8e7e-e0212bff46aa" />


- "Search Translations" window, to copy item names and stuff.
<img width="200" alt="Screenshot 2025-09-15 002026" src="https://github.com/user-attachments/assets/9d081d55-8e22-4c0c-8320-5ccbc2dc8884" />

- Fixes the game opening and closing windows when you type "I", "M", etc. into a text input.

## How do I get it
[Here is a link to the setup guide.](https://github.com/Antidissmist/Puppet-Guardian-Translator/wiki/Setup)

## Notes
- Most text you see for the first time will be incorrectly centered, or overflow its box. This is because the game's UI isn't adaptive, and its size is based on the Japanese text, which is usually smaller. You can usually reopen the dialog window, or refresh the page to fix it.
- As you play, the script will cache more text that you see. Some text is temporary, like chat messages. There is a chance that it will start to slow down after like months of doing quests, but I haven't noticed a problem so far. ¯\\\_(ツ)\_/¯
- There are likely multiple duplicate translations that I didn't account for. For example, "bring me the [item name]" would be translated multiple times for different items. I've handled a few important ones, like "[item name] Synthesis list", and "Obtained [item name] from [monster]".
- I'm not currently testing this script with Magical Rooms, but you can try out it by editing the script in Tampermonkey, and adding the Magical Rooms URL on a line at the top, like how the Puppet Guardian URL is.
- You can check the browser's log `Ctrl+Shift+I` to see all new text that is translated.
<img width="300" alt="log" src="https://github.com/user-attachments/assets/bd43fa6b-2fb3-4a77-9636-24bb8afc8ba2" />


If you find a bug or a weird broken translation, submit a Github Issue!

I spent a lot of time making this script, so if you'd like you can [support me on Ko-Fi](https://ko-fi.com/antidissmist)! ♥

