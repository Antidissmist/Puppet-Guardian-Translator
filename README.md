# Puppet Guardian Translator

A Tampermonkey userscript that translates Japanese text inside the game Puppet Guardian!




## Features
- Automatically finds Japanese text and quickly translates it into English as you play!
- Caches important text and item names, so most text you've seen before will be seamlessly replaced.
- Buttons to translate English text into Japanese, for the chat and other text inputs.
- "Search Translations" window, to copy item names and stuff.
- Fixes the game opening and closing windows when you type "I", "M", etc. into a text input.

# Setup

## 1. Get Tampermonkey
Get the [Tampermonkey](https://www.tampermonkey.net/) browser extension. Tampermonkey is an extension that allows you to run custom scripts on certain websites. This one only runs on the Puppet Guardian website to replace text.
## 2. Install the script
- Find the Tampermonkey logo on your extension bar, and open up its little menu.
- Go to the Dashboard.
- Open the tab labeled "Utilities".
- Find "Import from URL", and paste in the script's url: `https://github.com/Antidissmist/Puppet-Guardian-Translator/blob/main/userscript.js`
- Click Install.
- Confirm it's installed, by checking "Installed Userscripts" to see "Puppet Guardian Translator", and the green toggle is Enabled.
## 3. The annoying part
This script uses the Google Translate API to live translate text. If you want to live translate text, you'll have to use Google Cloud to get yourself an API key. This does require you to setup billing, but the amount of text that needs to be translated is really small, and it hasn't costed me a cent so far.

You can totally use the script and play the game without this feature, because plenty of text is pre-translated and stored in this repository. However chat messages, usernames, probably most quest dialogs, etc. will not be translated. 

"But wait, doesn't my browser have a built in 'translate this page' feature"? That's true, and I could make the script use that as a backup, but the translations were kind of worse than Google Translate.

### Setting up Google Cloud Translation

Here is Google's guide on setting up the Cloud Translation API: 
https://cloud.google.com/translate/docs/setup 
We just want the basic "v2" edition.

Here is what you need to do, following along that guide, until "Set usage quotas":

### 1. Create a new Google Cloud project

### 2. Enable billing

### 3​. Enable the Cloud Translation API

### 4​. Setup quotas (explain)

### 5​. Get your API key:
- Navigate to the [Google Cloud Console](https://console.cloud.google.com) for your new project.
- Now in the top left menu, go to `APIs & Services > Enabled APIs & Services`.
- On the left bar, click on the `Credentials` tab.
- On the top, click `+ Create Credentials`, and `API key`.
- In the popup menu, click `Restrict key`, and search for the `Cloud Translation API`.
- Click `Create`.
- The window will now show you your API key that you can copy. You can also click the key's name in the list, and "Show Key".
- When you start the game, you will notice a tiny gear icon in the top left. In this menu you can paste in your API Key for the script to use, and it should be good to go!

## Quirks
- Most text you see for the first time will be incorrectly centered, or overflow its box. This is because the game's UI isn't adaptive, and its size is based on the Japanese text, which is usually smaller. You can usually reopen the dialog window, or refresh the page to fix it.
- As you play, the script will cache more text that you see. Some text is temporary, like chat messages. There is a chance that it will start to slow down after like months of doing quests, but I haven't noticed a problem so far. ¯\\\_(ツ)\_/¯
- There are likely multiple duplicate translations that I didn't account for. For example, "bring me the [item name]" would be translated multiple times for different items. I've handled a few important ones, like "[item name] Synthesis list", and "Obtained [item name] from [monster]".


## Notes
If you find a bug or a weird broken translation, submit a Github Issue!

I spent a lot of time making this script, so if you'd like you can [support me on Ko-Fi](https://ko-fi.com/antidissmist)! ♥

