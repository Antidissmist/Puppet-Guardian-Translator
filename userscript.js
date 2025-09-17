// ==UserScript==
// @name         Puppet Guardian Translator
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Translates text inside the game Puppet Guardian
// @author       Antidissmist
// @homepage     https://github.com/Antidissmist/Puppet-Guardian-Translator
// @source       https://github.com/Antidissmist/Puppet-Guardian-Translator
// @match        https://artifact.jp/guardian/login.php
// @icon         https://www.google.com/s2/favicons?sz=64&domain=artifact.jp
// @downloadURL  https://raw.githubusercontent.com/Antidissmist/Puppet-Guardian-Translator/refs/heads/main/userscript.js
// @updateURL    https://raw.githubusercontent.com/Antidissmist/Puppet-Guardian-Translator/refs/heads/main/userscript.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

const sourceLanguageCode = "ja";
const targetLanguageCode = "en";
let translationCodeDefault = null;
let translationCodeTextInputs = null;
let translation_mapper = null;
let global_data_object = {}; //holds all translations and important stuff
let text_elements = [];
let text_listeners = {}; //{ <text>: [callbacks...] } for text we are awaiting translation


const DEBUG = false;
let global_config = {
    log_context: false,
    log_exclude_names: false,
    log_unknown_context: false,
};
let config_saved = {
    add_chat_marker: true,
};
let config_window_element = null;
let config_window_open = false;
let config_tsearch_box = null;
let has_api_key = true;
let gTranslateAPIKey = null;

const TextTypes = {
    MISC: "misc",
    ITEMS: "items",
    ITEM_DESC: "item_desc",
    DIALOG: "dialog",
    NAMES: "names",

    SESSION: "session",
    TEMPORARY: "temporary",
    PLAYERDATA: "playerdata",
};
const textTypeDefault = TextTypes.MISC;

const common_word_substitutions = {
    "すごろくステージ": "Dice Game Stage",
    "スプレンドルミサス": "Splendor Mythos",
    "モーリアス": "Morias",
    "の宝箱": "Treasure Chest",
};

//public translation cache that can be edited & updated
const translation_cache_url = `https://raw.githubusercontent.com/Antidissmist/Puppet-Guardian-Translator/refs/heads/main/data/translations.json`;
const script_version = 1; //compared to version in public data

const chat_translation_marker = "(🌐翻訳)";
const chat_translation_marker_en = "(🌐)"

//some uncommon characters that translate shouldn't replace
const number_replacements = [ "▘", "▚" ];

/**
 * @desc outputs something to the console
 */
function trs_log(str) {
    console.log(`🌐 ${str}`);
}

/**
 * @desc set up everything
 */
function trs_init() {

    translationCodeDefault = new TranslationCode(sourceLanguageCode,targetLanguageCode); //ja->en
    translationCodeTextInputs = new TranslationCode(targetLanguageCode,sourceLanguageCode); //en->ja
    translation_mapper = new TranslationMapper();

    let data = trs_load();
    if (!data) {
        data = {
            "translation_data": {},
            "gtranslate_api_key": null,
            "config_saved": config_saved,
        };
    }
    global_data_object = data;
    if (data.translation_data) {
        translation_mapper.load(data.translation_data);
    }
    gTranslateAPIKey = data.gtranslate_api_key ?? "";
    if (data.config_saved) {
        config_saved = data.config_saved;
    }

    trs_styles_init();
    trs_input_translators_init();
    trs_config_init();

    trs_check_public_cache();

    trs_log("script setup 😎");

    const interval_check = setInterval(trs_check_all,1000); //every second
}

/**
 * @desc Updates our local translation cache from the public one stored on Github
 */
function trs_check_public_cache() {

    GM_xmlhttpRequest({
        method: "GET",
        url: translation_cache_url,
        headers: {
            'Accept': 'application/json',
            "Content-Type": "application/json",
            "User-Agent": "bazinga"
        },
        contentType: 'application/json',
        overrideMimeType: 'application/json',
        onload: function(response) {
            try {
                const obj = JSON.parse(response.responseText);

                if (obj.version > script_version) {
                    alert(`Please update the translation script in order to receive new shared translations!`);
                    return;
                }

                const count = translation_mapper.load(obj.translation_data);
                trs_save();
                if (count>0) {
                    trs_log(`Updated ${count} new translations from the public cache!`);
                }
            }
            catch(e) {
                trs_log(`Failed to parse public cache json!`);
                console.error(e);
            }
        },
        onerror: function(e) {
            console.error(e);
        },
    });

}

/**
 * @desc loads our persistent data from the tampermonkey storage
 * @returns {?Object} loaded data
 */
function trs_load() {
    let obj = GM_getValue("_translated_data",null);
    //nothing saved
    if (!obj) {
        return null;
    }
    return obj;
}

/**
 * @desc saves all our persistent data to the tampermonkey storage
 */
function trs_save() {
    global_data_object.translation_data = translation_mapper.save();
    GM_setValue("_translated_data",global_data_object);
}

/**
 * @desc update an entry with translated text
 * @param {string} key
 * @param {string} text
 * @param {string} text_type
 * @param {TranslationCode} translation_code
 */
function trs_update_translation(key,text,type=textTypeDefault,translationcode=translationCodeDefault) {
    if (type==TextTypes.TEMPORARY) return;
    translation_mapper.set_mapping(key,text,type,translationcode);
    if (trs_text_type_is_saved(type,translationcode)) {
        trs_save();
    }
}

/**
 * @desc returns whether the type of text should be saved
 * @param {string} text_type 
 * @param {TranslationCode} translationcode 
 * @returns {boolean}
 */
function trs_text_type_is_saved(type,translationcode=translationCodeDefault) {
    switch(type) {
        case TextTypes.TEMPORARY:
        case TextTypes.SESSION:
            return false;
        default:
            return true;
    }
}

/**
 * @desc gets stored text. returns key if not translated
 * @param {string} key
 * @param {TranslationCode} translation_code
 * @param {?string} overwrite_type if provided a saveable text type, it will ensure the cached text is saved
 * @returns {string}
 */
function trs_get(key,translation_code=translationCodeDefault,overwrite_type=null) {
    return translation_mapper.get_mapping(key,translation_code,overwrite_type);
}

/**
 * @desc checks all tracked text elements (doesn't really do anything useful)
 */
function trs_check_all() {
    text_elements.forEach((str,index,object)=>{
        let text_elem = str.element_ref;//.deref();

        //text was destroyed, untrack
        if (!text_elem || text_elem._destroyed) {
            object.splice(index,1); //???
            return;
        }

        //trs_check_element(str); //not necessary anymore
    });
}

/**
 * @desc reads initial text and splits it into pieces
 * @param {TextTracker} elem_tracker 
 */
function trs_text_tracker_init(elem_tracker) {

    const text_elem = elem_tracker.element_ref;
    if (!text_elem || text_elem._destroyed) {
        return;
    }

    const text_info = trs_element_initial_read_text(text_elem.text);
    const text_key = text_info.text; //prefix, postfix & numbers replaced

    if (trs_string_is_empty(text_key)) return; //nothing to do with this string

    //new base text
    if (text_key != elem_tracker.text_key) {
        elem_tracker.text_key = text_key;
        elem_tracker.text_info = text_info;

        //split string into recognized & translatable parts
        elem_tracker.text_pieces = trs_replace_context(text_key,elem_tracker.context_stack);
    }
}

/**
 * @desc Translates parts of a text element, and replaces the final text when done
 * @param {TextTracker} elem_tracker the object referencing the text element
 */
function trs_check_element(elem_tracker) {

    if (!elem_tracker.needs_translation()) return; //nothing to do

    trs_text_tracker_init(elem_tracker);

    const splits = elem_tracker.text_pieces;
    if (splits.length==0) return;
    const text_type = elem_tracker.text_type;
    let all_translated = true;
    splits.forEach((piece)=>{

        if (!piece.needs_translation()) return; //nothing to do

        let text = piece.text;
        //get recorded text (if missing, value unchanged)
        text = trs_get(text,translationCodeDefault,text_type);

        //the edited/recorded value contains untranslated text, so we must translate it
        if (trs_string_contains_jp(text)) {
            const on_translation_response = (out_text)=>{
                piece.text = out_text;
                trs_update_translation(text,out_text,text_type);
                trs_check_element(elem_tracker);
            };
            trs_await_translation(text,on_translation_response);
            all_translated = false; //at least 1 piece is waiting for translation
        }
        //got translated text :) replace
        else {
            piece.text = text;
        }
    });

    //all parts are translated, so we can finally replace the full text
    if (all_translated) {
        trs_apply_final_text(elem_tracker);
    }

}

/**
 * @desc Applies the final edited/translated text to the text element. (puts numbers, prefix & postfix back in)
 * @param {TextTracker} elem_tracker 
 */
function trs_apply_final_text(elem_tracker) {
    const text_elem = elem_tracker.element_ref;
    const fulltext = elem_tracker.get_full_string();
    text_elem.text = trs_make_final_text(fulltext,elem_tracker.text_info);
}

/**
 * @desc Puts numbers, prefix & postfix back into a translated string
 * @param {string} text_translated
 * @param {Object} text_info
 */
function trs_make_final_text(text_translated,text_info) {
    
    let text = text_info.prefix + text_translated + text_info.postfix;

    //put numbers back in
    let num_index = 0;
    for (const num of text_info.numbers) {
        const num_repstr = number_replacements[num_index % number_replacements.length];
        text = text.replace(num_repstr,num);
        num_index++
    }

    return text;
}

/**
 * @desc Gets the stripped-down "key" version of the text, taking out the numbers, prefix & postfix
 * @param {string} text 
 */
function trs_element_initial_read_text(text) {

    let info = {
        text: text,
        prefix: "",
        postfix: "",
        numbers: [],
    };

    if (trs_string_is_empty(text)) return info;

    //remove beginning and end whitespace
    const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (match!=null) {
        info.prefix = match[1];
        text = match[2];
        info.postfix = match[3];
    }

    //find numbers, replace them with their index (>1, to be plural)
    const nums = text.match(/\b\d[\d,.]*\b/g);
    if (nums!=null) {
        let num_index = 0;
        for (let numstr of nums) {
            let num = Number.parseFloat(numstr);
            if (Number.isNaN(num)) continue;

            const num_repstr = number_replacements[num_index % number_replacements.length];
            text = text.replace(numstr,num_repstr);

            info.numbers.push(numstr);
            num_index++
        }
    }

    info.text = text;

    return info;
}

/**
 * @desc Requests a translation if needed, and otherwise adds a listener
 * @param {string} text
 * @param {Function} on_translation_response
 * @param {TranslationCode} translation_code
 */
function trs_await_translation(text,on_translation_response,translation_code=translationCodeDefault) {

    if (!has_api_key) return;
    if (!gTranslateAPIKey) {
        has_api_key = false;
        trs_popup_text("API Key required for live translation!");
        return;
    }

    //no request sent yet
    if (!text_listeners[text]) {
        text_listeners[text] = [on_translation_response];
        trs_request_translation(text,translation_code);
    }
    //already requested somewhere. wait for response
    else {
        text_listeners[text].push(on_translation_response);
    }
}

/**
 * @desc Requests the source text to be translated, and calls the listeners when completed.
 * @param {string} text_source
 * @param {TranslationCode} translation_code
 */
function trs_request_translation(text_source,translation_code=translationCodeDefault) {

    //translate text using local browser (bad translations)
    /*let tempdiv = document.createElement("div");
    tempdiv.style.visibility = "hidden";
    tempdiv.style.position = "fixed";
    tempdiv.style.width = 0;
    tempdiv.style.height = 0;
    tempdiv.appendChild(document.createTextNode(text_source));
    let observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === "childList" || mutation.type === "characterData") {
                let listeners = text_listeners[text_source];
                if (listeners) {
                    text_listeners[text_source].forEach((listener)=>{
                        listener(tempdiv.textContent);
                    });
                }
                delete text_listeners[text_source];
                observer.disconnect();
                tempdiv.remove();
            }
        }
    });
    observer.observe(tempdiv, {
        childList: true,
        characterData: true,
    });
    document.body.appendChild(tempdiv);*/


    //request from google cloud translate api
    var req = new XMLHttpRequest();
    const url = `https://translation.googleapis.com/language/translate/v2?key=${gTranslateAPIKey}`;
    req.open("POST", url, true);
    req.setRequestHeader("Content-Type","application/json; charset=utf-8");
    req.onload = () => {
        let response = JSON.parse(req.response);
        if (req.status >= 200 && req.status < 300) {
            //try parsing the response
            let out_text = response?.data?.translations?.[0]?.translatedText;
            if (out_text) {
                trs_log(`translated "${text_source}" -> "${out_text}"`);
                //call listeners
                text_listeners[text_source].forEach((listener)=>{
                    listener(out_text);
                });
            }
            else {
                trs_log(`translation failed! out text: ${out_text}`);
            }
        }
        else {
            if (req.status==400) {
                if (response.error.details[0].reason=="API_KEY_INVALID") {
                    trs_popup_text("Invalid API Key!");
                    has_api_key = false;
                }
            }
            trs_log(`Translation request failed with status: ${req.status}, "${req.message}"`);
        }
        //always clear listeners
        delete text_listeners[text_source];
    }

    //https://developers.google.com/workspace/admin/directory/v1/languages
    req.send(JSON.stringify({
        "q": text_source,
        "source": translation_code.source,
        "target": translation_code.target,
        "format": "text"
    }));
    
}

/**
 * @desc returns whether the text contains any japanese characters
 * @param {string} str
 * @returns {boolean}
 */
function trs_string_contains_jp(str) {
    const regex_jp = /[\u3000-\u303F]|[\u3040-\u309F]|[\u30A0-\u30FF]|[\uFF00-\uFFEF]|[\u4E00-\u9FAF]|[\u2605-\u2606]|[\u2190-\u2195]|\u203B/;
    str = str.replaceAll("\u3000",""); //IDEOGRAPHIC SPACE
    str = str.replaceAll(" ",""); //SPACE [SP]
    str = str.replaceAll("？",""); //FULLWIDTH QUESTION MARK

    return regex_jp.test(str);
}

/**
 * @desc whether the text contains meaningful non-empty characters that can be translated
 * @param {string} str
 * @returns {boolean}
 */
function trs_string_is_empty(str) {
    str = str.replaceAll("\u3000",""); //IDEOGRAPHIC SPACE
    str = str.replaceAll(" ",""); //SPACE [SP]
    str = str.replaceAll("？",""); //FULLWIDTH QUESTION MARK
    str = str.replaceAll("。",""); //IDEOGRAPHIC FULL STOP

    if (!str) {
        return true;
    }
    return false;
}

/**
 * @desc Makes known replacements to an un-translated string, given its calling context. 
 * This fixes some duplicate translations. 
 * Returns an array of pieces that can be translated separately.
 * @param {string} str 
 * @param {string} context_string
 * @param {TextPiece[]}
 */
function trs_replace_context(str,context) {

    //replace common words
    for (const [key,value] of Object.entries(common_word_substitutions)) {
        str = str.replaceAll(key,value);
    }

    let out_array = [str];

    //item pickup
    if (context.includes("doGetItem")) {
        let itemsource = str.replace("を入手しました",""); // "<item from source><you got the>" -> "<item from source>"
        
        //item "from" source
        if (itemsource.includes("から")) {
            let split = itemsource.split("から"); //[ "lizard", "lizard tail" ]
            out_array = ["Obtained ",split[1]," from ",split[0]];
        }
        else {
            out_array = ["Obtained ",itemsource];
        }
    }
    //synthesis list title (backpack or warehouse)
    else if (context.includes("setWinSynthesis")) {
        let synthitem = str.replace("を主材料とした合成リスト",""); //"<item><synthesis list>" -> "<item>"
        out_array = [synthitem," Synthesis List"];
    }
    //prioritize dice
    else if (context.includes("InterfaceMain$clickDiceView") && str.includes("のサイコロ使用を優先にしました")) {
        let diceowner = str.replace("のサイコロ使用を優先にしました",""); //player or pet name
        out_array = ["Prioritizing dice from ",diceowner];
    }
    //throw away item (backpack or warehouse)
    else if (context.includes("Artifact$putInformation") && context.includes("Delete")) {
        let itm = str.replace("を捨てました。",""); //threw away item -> item
        out_array = ["You threw away the ",itm];
    }
    //merchant sell
    else if (context.includes("Artifact$InterfaceShop$putPriceWindow") && context.includes("Artifact$GUIFactory$createTextField$origin")) {
        let itm = str.replace("\nを銀貨何 Sで売りに出しますか？","");
        out_array = ["How many silver coins would \nyou like to sell ",itm," for?"];
    }
    //thief's guild treasure info
    else if (context.includes("Artifact$InterfaceThief$putCheckWindow\ndoTreasureInfo") && str.includes("あら、すごい。")) {
        let itm = str.split("「")[1].split("」")[0]; //name of the treasure chest
        out_array = [`Oh, wow. You've found a "`,itm,`".\nTreasure Chests of this type often contain one of the following:\n\nIf you'd like, I can open it for you with ▘ Silver Coins.`];
    }
    //chat balloon
    else if (context.includes("Artifact$Balloon\nCreature$setChat")) {
        //it's a translated message from you or someone else
        if (str.startsWith(chat_translation_marker)) {
            //replace their translation marker, so we just translate their message
            out_array = [ chat_translation_marker_en+" ", str.replace(chat_translation_marker+" ","") ];
        }
        //mark that the chat message was translated
        else if (trs_string_contains_jp(str)) {
            out_array = [chat_translation_marker_en+" ",str];
        }
    }
    else {
        if (global_config.log_unknown_context) {
            trs_log(`unknown context:\n${context}`)
        }
    }

    return out_array.map((str)=>{
        return new TextPiece(str);
    });
}

/**
 * @desc Makes a text popup, using the built in notifications (awesome)
 * @param {string} text 
 */
function trs_popup_text(text) {
    unsafeWindow.Artifact$putInformation("🌐 "+text);
}

/**
 * @desc adds a stylesheet to the website for our custom elements
 */
function trs_styles_init() {
    let styles = document.createElement("style");
    styles.setAttribute("type","text/css");
    styles.textContent = `
    .trs_inv_button {
        background-color: #bfe3d4;
        border: 3px double #5f9085;
        box-shadow: 1px 1px 0px #29544f;
    }
    .trs_inv_button:hover {
        background-color: #f0f7f4;
    }
    .trs_inv_button:active {
        background-color: #7abaa3;
    }
        
    .trs_chat_button {
        background-color: #d8d8d8d6;
        border: 1px solid #787877;
        border-radius: 4px;
    }
    .trs_chat_button:hover {
        border-color: #ff6600;
    }
    .trs_chat_button:active {
        border-color: #787877;
    }

    .trs_translation_button {
        padding: 0;
        position: absolute;
        transform: translate(-100%);
        opacity: 0.5;
    }
    .trs_translation_button:hover {
        opacity: 1;
    }

    .trs_config_button {
        position: absolute;
        left: 0;
        top: 0;
        width: 1.5em;
        height: 1.5em;
    }
    .trs_config_window {
        position: absolute;
        left: 0;
        top: 25px;
        padding: 8px;
        background-color: #d8d8d8d6;
        border: 1px solid #787877;
        border-radius: 4px;
        text-align: left;
    }
    .trs_config_window label {
        display: block;
    }
    .trs_config_window h1,summary {
        font-weight: bold;
    }

    .trs_search_results_box {
        height: 200px;
        min-width: 200px;
        min-height: 100px;
        overflow: scroll;
        list-style: disc outside;
        padding-bottom: 8px;
        resize: both;
    }
    .trs_search_results_box li {
        margin-left: 15px;
        margin-right: 10px;
        margin-top: 7px;
        background: #6c6c6c47;
        padding: 0px 6px 0px 6px;
        border-radius: 4px;
        width: 200%;
    }
    `;
    document.head.appendChild(styles);
}

/**
 * @desc updates the translation button to the text input's position
 * @param {Element} button_element
 * @param {Element} input_element
 */
function trs_transbutton_position(button,input) {
    let parentpos = input.parentNode.getBoundingClientRect();
    let rect = input.getBoundingClientRect();
    let leftpos = rect.right-parentpos.left;
    let toppos = rect.top-parentpos.top;
    button.style.left = `${leftpos}px`;
    button.style.top = `${toppos}px`;
    button.style.display = input.checkVisibility({
        visibilityProperty: true,
        opacityProperty: true,
    }) ? "block" : "none"; //hide with input

    const is_chat_style = input.style["background-color"]=="transparent";
    button.classList.remove("trs_inv_button","trs_chat_button");
    button.classList.add(is_chat_style ? "trs_chat_button" : "trs_inv_button");
}

/**
 * @desc gets or requests the translated string, and calls the callback
 * @param {function} in_string_getter returns the value of the input string. if it changes, the callback will not be called.
 * @param {string} text_type
 * @param {TranslationCode} translation_code
 * @param {function} callback called when the value is returned
 */
function trs_get_translation_value(in_string_getter,text_type,translation_code,callback) {
    //check empty string
    const in_string = in_string_getter();
    if (trs_string_is_empty(in_string)) return;

    const text_info = trs_element_initial_read_text(in_string); //numbers, prefix & postfix replaced
    const key_text_src = text_info.text;

    const set_result_value = (str)=>{
        if (in_string_getter()!=in_string) return; //value changed
        callback(trs_make_final_text(str,text_info));
    };

    const cached_value = trs_get(key_text_src,translation_code);
    //already translated
    if (cached_value!=key_text_src) {
        set_result_value(cached_value);
    }
    //wait for translation
    else {
        const tcallback = (key_text_targ)=>{
            trs_update_translation(key_text_src,key_text_targ,text_type,translation_code);
            set_result_value(key_text_targ);
        };
        trs_await_translation(key_text_src,tcallback,translation_code);
    }
}

/**
 * @desc adds a translation button to a text input element
 * @param {Element} input_element
 */
function trs_track_text_input(input_elem) {
    //all inputs should have this attribute so we can easily tell if its in the game or on the page
    if (input_elem.hasAttribute("data-trs-tracked")) return; //already tracked
    input_elem.setAttribute("data-trs-tracked",true);

    //find the chat box input
    const style = window.getComputedStyle(input_elem);
    const is_chat = (style.width=="340px" && style.height=="20px" && style.left=="203px" && style.backgroundColor=="rgba(0, 0, 0, 0)");
    //const is_chat_target = (style.width=="152px" && style.height=="20px" && style.left=="20px" && style.backgroundColor=="rgba(0, 0, 0, 0)");

    const tbutton = document.createElement("button");
    tbutton.textContent = "🌐";
    tbutton.classList.add("trs_translation_button");
    tbutton.onclick = ()=>{

        trs_get_translation_value( ()=>input_elem.value, TextTypes.SESSION,translationCodeTextInputs, (text_final)=>{
            // (translation) + message
            if (is_chat && config_saved.add_chat_marker) {
                text_final = chat_translation_marker + " " + text_final;
            }
            input_elem.value = text_final;
        });

    };
    input_elem.parentNode.appendChild(tbutton);
    trs_transbutton_position(tbutton,input_elem);

    //listen for attribute changes of the text input
    const obs_changes = new MutationObserver((mutationList, observer)=>{
        for (const mutation of mutationList) {
            if (mutation.type === "attributes") {
                trs_transbutton_position(tbutton,input_elem);
            }
        }
    });
    obs_changes.observe(input_elem,{ attributes: true });

    //listen for removal of the text input
    const obs_remove = new MutationObserver((mutationList, observer)=>{
        for (const mutation of mutationList) {
            if (mutation.type === "childList") {
                if (Array.from(mutation.removedNodes).includes(input_elem)) {
                    //remove the translation button
                    tbutton.remove();
                    obs_changes.disconnect();
                    obs_remove.disconnect();
                }
            }
        }
    });
    obs_remove.observe(input_elem.parentNode,{ childList: true });
}

/**
 * @desc tracks the chat dropdown in order to translate it
 * @param {Element} select_elem
 */
function trs_track_chat_select(select_elem) {

    select_elem.classList.add("notranslate");
    new MutationObserver((mutationList,observer)=>{
        for (const mutation of mutationList) {
            //added or removed
            if (mutation.type=="childList") {
                for (const node of mutation.addedNodes) {

                    //translate the option's text
                    if (trs_string_contains_jp(node.textContent)) {
                        trs_get_translation_value( ()=>node.textContent, TextTypes.NAMES,translationCodeDefault, (text_final)=>{
                            node.textContent = text_final;
                        });
                    }

                }
            }
        }
    })
    .observe(select_elem,{ attributes: false, childList: true, subtree: true });

}

/**
 * @desc tracks the chat history in order to translate it
 * @param {Element} chat_div
 */
function trs_track_chat_history(div) {

    const check_nodelist = (nodeList)=>{
        for (const node of nodeList) {
            //bold text, chat name
            if (node.nodeName=="B") {
                if (trs_string_contains_jp(node.textContent)) {
                    trs_get_translation_value( ()=>node.textContent, TextTypes.SESSION, translationCodeDefault, (text_final)=>{
                        node.textContent = text_final;
                    });
                }
            }
            //text node
            else if (node.nodeName=="#text") {
                //chat text, needs translation
                if (node.textContent.startsWith("> ") && trs_string_contains_jp(node.textContent)) {
                    const value_getter = ()=>{
                        let str = node.textContent.replace("> ","");
                        if (str.startsWith(chat_translation_marker)) {
                            str = str.replace(chat_translation_marker+" ","");
                        }
                        return str;
                    };
                    trs_get_translation_value( value_getter, TextTypes.SESSION, translationCodeDefault, (text_final)=>{
                        node.textContent = "> "+chat_translation_marker_en+" "+text_final;
                    });
                }
            }
            //colored message
            else if (node.nodeName=="FONT") {
                check_nodelist(node.childNodes);
            }
        }
    };

    div.classList.add("notranslate");
    new MutationObserver((mutationList,observer)=>{
        for (const mutation of mutationList) {
            if (mutation.type=="childList") {
                check_nodelist(mutation.addedNodes);
            }
        }
    })
    .observe(div,{ attributes: false, childList: true, subtree: true })
}

/**
 * @desc starts watching for text inputs, to add translation buttons to them
 */
function trs_input_translators_init() {
    //find existing text inputs
    unsafeWindow.document.querySelectorAll("input[type='text'] , textarea").forEach((input)=>{
        trs_track_text_input(input);
    });

    //listen for creation of text inputs
    const observer_inputs = new MutationObserver((mutationList, observer) => {
        for (const mutation of mutationList) {
            if (mutation.type === "childList") {
                for (const node of mutation.addedNodes) {
                    //listen for new text inputs
                    if (
                        (node.nodeName=="INPUT" && node.getAttribute("type")=="text")
                        || (node.nodeName=="TEXTAREA")
                    ) {
                        trs_track_text_input(node);
                    }
                    else if (
                        node.nodeName=="SELECT"
                    ) {
                        let style = window.getComputedStyle(node);
                        //chat target dropdown
                        if (style.left=="20px" && style.width=="182px" && style.height=="23px") {
                            trs_track_chat_select(node);
                        }
                    }
                    else if (
                        node.nodeName=="DIV"
                    ) {
                        let style = window.getComputedStyle(node); //slow
                        //chat history window
                        if (style.left=="15px" && style.width=="389px" && style.overflow=="hidden") {
                            trs_track_chat_history(node);
                        }
                    }
                }
            }
        }
    });
    const gameScreen = unsafeWindow.document.querySelector("#gameScreen");
    observer_inputs.observe(gameScreen, { attributes: false, childList: true, subtree: true } );
}

/**
 * @desc creates an HTML menu for configuring the script
 */
function trs_config_init() {

    let butt = document.createElement("button");
    butt.classList.add("trs_config_button","trs_chat_button");
    butt.textContent = "⚙";
    butt.onclick = ()=>{
        config_window_open = !config_window_open;
        config_window_element.style.setProperty("display",config_window_open ? "block" : "none");
    };

    config_window_element = document.createElement("div");
    config_window_element.classList.add("trs_config_window","notranslate");
    config_window_element.style.setProperty("display","none");
    unsafeWindow.document.body.appendChild(butt);
    unsafeWindow.document.body.appendChild(config_window_element);

    const _elem_check = (name,id,state=false)=>{
        const checkedval = state ? `checked=checked` : "";
        return `<label for="${id}"><input type="checkbox" id="${id}"${checkedval}>${name}</label>`;
    };
    const _elem_on_checked = (id,_onchange)=>{
        config_window_element.querySelector(id).onchange = (event)=>{
            _onchange(event.currentTarget.checked);
        };
    };
    const _elem_on_input = (id,_onchange)=>{
        config_window_element.querySelector(id).onchange = (event)=>{
            _onchange(event.target.value);
        };
    };
    const _elem_on_click = (id,_onclick)=>{
        config_window_element.querySelector(id).onclick = (event)=>{
            _onclick(event);
        };
    };

    let htmlstr = `
    <details>
        <summary>Config</summary>

        <label for="trs_apikey"><input type="password" autocomplete="off" id="trs_apikey" value="${gTranslateAPIKey}">API Key</label>

        ${_elem_check(`Add "(🌐translation)" to chat messages`,"trs_add_chat_marker",config_saved.add_chat_marker)}
    </details>

    <details>
        <summary>Search translations</summary>

        <label for="trs_tsearch"><input type="text" id="trs_tsearch">Search</label>
        <ul class="trs_search_results_box"></ul>
    </details>

    <details>
        <summary>Useful</summary>

        <a href="https://artifact.jp/guardian/item/item.php" target="_blank">Item Guidebook</a>
    </details>
    `;
    
    //debugging options
    if (DEBUG) {
        htmlstr += `
        <details>
            <summary>Debugging</summary>

            ${_elem_check("Log context","trs_log_context")}
            ${_elem_check("Log unknown context","trs_log_unknown")}
            ${_elem_check("Exclude NameLabel","trs_log_names")}

            <button id="trs_log_elements">Log all elements</button>

        </details>
        `;
    }

    config_window_element.innerHTML = htmlstr;

    config_tsearch_box = config_window_element.querySelector(".trs_search_results_box");

    _elem_on_checked("#trs_add_chat_marker",(val) => config_saved.add_chat_marker = val);
    _elem_on_input("#trs_apikey",(val)=>{
        gTranslateAPIKey = val;
        global_data_object.gtranslate_api_key = val;
        has_api_key = true;
        trs_log("accepted API Key");
        trs_save();
    });
    _elem_on_input("#trs_tsearch",(val)=>{
        //remove all search results
        while (config_tsearch_box.firstChild) {
            config_tsearch_box.removeChild(config_tsearch_box.firstChild);
        }

        if (!val.replaceAll(" ","")) return; //empty string
        val = val.toLowerCase();
        
        const reverse_code = TranslationCode.get_reverse_code(translationCodeDefault); //en->ja
        const langmap = translation_mapper.get_language_map(reverse_code);
        if (!langmap) return; //no language map
        const allmappings = langmap.get_all_mappings();
        
        //filter keys containing value
        const filtered = Object.keys(allmappings)
        .filter((key)=>key.toLowerCase().includes(val))
        .slice(0,30) //only show some results
        .reduce((obj,cur)=>{
            obj[cur] = allmappings[cur];
            return obj;
        },{});
        
        for(const [key,value] of Object.entries(filtered)) {
            let entry = document.createElement("li");
            entry.appendChild(document.createTextNode(`${key} -> ${value}`));
            config_tsearch_box.appendChild(entry);
        }
    });

    if (DEBUG) {
        _elem_on_checked("#trs_log_context",(val) => global_config.log_context = val);
        _elem_on_checked("#trs_log_unknown",(val) => global_config.log_unknown_context = val);
        _elem_on_checked("#trs_log_names",(val) => global_config.log_exclude_names = val);
        _elem_on_click("#trs_log_elements",()=>{
            text_elements.forEach(elem=>{
                console.log(`element text, stack:`);
                console.log(elem.element_ref.text);
                console.log(elem.context_stack);
            });
        });
    }

}


/**
 * A tracker for a piece of text. 
 * It holds a reference to one PIXI.Text element, and pieces of the text that can be translated separately. 
 */
class TextTracker {

    text_key = null; //text with numbers, prefix & postfix replaced
    text_info = null;
    text_pieces = [];
    constructor(elem,stack,type) {
        this.element_ref = elem;
        this.context_stack = stack;
        this.text_type = type;
    }

    //whether any part needs translation
    needs_translation() {

        //the displayed text needs translation
        if (trs_string_contains_jp(this.element_ref.text)) {
            return true;
        }

        return this.text_pieces.some((piece)=>{
            return piece.needs_translation();
        });
    }

    get_full_string() {
        return this.text_pieces.reduce((prev,cur)=>{
            return prev + cur.text;
        },"");
    }
}

/**
 * Simply holds one piece of text that may be combined with others.
 */
class TextPiece {
    constructor(text) {
        this.text = text;
    }
    needs_translation() {
        return trs_string_contains_jp(this.text);
    }
}

/**
 * A structure representing the direction of a translation. ("ja->en")
 */
class TranslationCode {
    constructor(source,target) {
        this.source = source;
        this.target = target;
    }
    static get_reverse_code(code) {
        let src;
        let trg;
        if ((typeof code) == "string") {
            const split = code.split("->");
            src = split[0];
            trg = split[1];
        }
        else {
            src = code.source;
            trg = code.target;
        }
        //swapped order:
        return `${trg}->${src}`;
    }
    toString() {
        return `${this.source}->${this.target}`;
    }
}

/**
 * A map for strings from one language to another. Strings are be separated by types.
 */
class LanguageMap {
    constructor() {
        this.maps = {};
        this.saved = true;
    }
    check_defined(type) {
        if (!this.maps[type]) {
            let is_saved = true;
            if (type==TextTypes.SESSION || type==TextTypes.TEMPORARY) {
                is_saved = false;
            }
            this.maps[type] = {
                "translations": {},
                "saved": is_saved,
            };
        }
    }
    set_mapping(from,to,type) {
        this.check_defined(type);
        this.maps[type].translations[from] = to;
    }
    get_mapping(from,overwrite_type=null) {
        let found_val = null;
        let found_type = null;
        for(const type in this.maps) {
            const val = this.maps[type].translations[from];
            if (val) {
                found_val = val;
                found_type = type;
                break;
            }
        }
        //no mapping exists
        if (!found_val) {
            found_val = from;
        }
        //we found a mapping, but it's temporary and we actually want to save it
        else if ( overwrite_type!=null && !trs_text_type_is_saved(found_type) && trs_text_type_is_saved(overwrite_type) ) {
            delete this.maps[found_type].translations[from];
            this.set_mapping(from,found_val,overwrite_type);
            trs_save();
        }
        return found_val;
    }
    get_all_mappings() {
        let allobj = {};
        for(const map of Object.values(this.maps)) {
            Object.assign(allobj,map.translations);
        }
        return allobj;
    }
    save() {
        let saveobj = {};
        for(const [type,map] of Object.entries(this.maps)) {
            if (!map.saved) continue;
            saveobj[type] = map.translations;
        }
        return saveobj;
    }
    clear() {
        this.maps = {};
    }
    load(obj,reverse=false) {

        let count = 0;

        //load type maps
        for(const [type,map] of Object.entries(obj)) {
            this.check_defined(type);
            //load string mappings
            for(const [key,value] of Object.entries(map)) {
                let k = key;
                let v = value;
                if (reverse) {
                    k = value;
                    v = key;
                }

                const exist_val = this.maps[type].translations[k];
                if (v != exist_val) {
                    count++
                }

                this.maps[type].translations[k] = v;
            }
        }

        return count;
    }
}

/**
 * An object that manages mappings for multiple languages.
 */
class TranslationMapper {
    constructor() {
        this.maps = {};
    }
    check_defined(translation_code) {
        if (!this.maps[translation_code]) {
            this.maps[translation_code] = new LanguageMap();
        }
        const reverse_code = TranslationCode.get_reverse_code(translation_code);
        if (!this.maps[reverse_code]) {
            this.maps[reverse_code] = new LanguageMap();
            this.maps[reverse_code].saved = false;
        }
    }
    set_mapping(from,to,type,translation_code) {
        this.check_defined(translation_code);
        //store mapping
        this.maps[translation_code].set_mapping(from,to,type);
        //store reverse
        const reverse_code = TranslationCode.get_reverse_code(translation_code);
        this.maps[reverse_code].set_mapping(to,from,type);
    }
    get_mapping(from,translation_code,overwrite_type=null) {
        return this.maps[translation_code]?.get_mapping(from,overwrite_type) ?? from;
    }
    get_language_map(translation_code) {
        return this.maps[translation_code];
    }

    save() {
        let saveobj = {};
        for(const [tcode,map] of Object.entries(this.maps)) {
            if (!map.saved) continue;
            saveobj[tcode] = map.save();
        }
        return saveobj;
    }
    clear() {
        this.maps = {};
    }
    load(obj) {
        let count = 0;
        for(const [tcode,map] of Object.entries(obj)) {
            this.check_defined(tcode);
            count += this.maps[tcode].load(map);
            //load reverse
            const reverse_code = TranslationCode.get_reverse_code(tcode);
            this.maps[reverse_code].load(map,true);
        }
        return count;
    }
}

/// start ///
trs_init();





//what a mess
function waitForFunction(fnNames, callback) {
    const interval = setInterval(() => {
        let fn = unsafeWindow;
        if (Array.isArray(fnNames)) {
            fnNames.forEach((name)=>{
                fn = fn[name];
            });
        }
        else {
            fn = fn[fnNames];
        }
        if (typeof fn === 'function') {
            clearInterval(interval);
            callback(fn);
        }
    }, 100);
}


//(bugfix) listen for keyDownHandler so we can prevent opening windows while we're using a text input
waitForFunction("keyDownHandler", function(originalFn) {
    unsafeWindow.keyDownHandler = new Proxy(originalFn,{
        apply(target, thisArg, args) {

            const event = args[0];
            const keycode = event.keyCode;
            const elem = document.activeElement;

            let passthru = false;

            if (elem.hasAttribute("data-trs-tracked")) {
                if (
                    keycode==13 //allow the enter key on text inputs inside the game
                ) {
                    passthru = true;
                }
            }
            
            if (!passthru) {
                if (elem.nodeName=="INPUT" && elem.type=="text") {
                    return;
                }
                else if (elem.nodeName=="TEXTAREA") {
                    return;
                }
            }

            //call original keyDownHandler (open inventory, spells, etc.)
            return Reflect.apply(target, thisArg, args);
        },
    });
})

//listen for the PIXI.Text function so we can override it
waitForFunction(['PIXI','Text'], function(originalFn) {

    unsafeWindow.PIXI.Text = new Proxy(originalFn, {
        construct(target, args, newTarget) {

            //create the PIXI.Text
            let elem = Reflect.construct(target, args, newTarget);

            //get context of call (funny trick)
            let _tempobj = {};
            Error.captureStackTrace(_tempobj);
            let stack = _tempobj.stack;
            //remove unnecessary text from stack trace, since some of them are really long
            //removes (lines ending with a url, or "construct@") and (the rest of the string, if it begins with one of the things below)
            stack = stack.replaceAll( /(@https:\/\/|construct@).*$|(interval|setTimeout|setInterval|_emscripten|r\.prototype|event_|C\<\/)[\s\S]*$/gm, "" );

            //set a text type based on the calling context
            let text_type = textTypeDefault;
            //buttons are misc
            if (stack.includes("Artifact$ButtonArtifact")) {
                text_type = TextTypes.MISC;
            }
            //chat is session
            else if (stack.includes("Creature$setChat")) {
                text_type = TextTypes.SESSION;
            }
            //name labels
            else if (stack.includes("NameLabel")) {
                //player names are session
                if ((stack.includes("CharacterObject") || stack.includes("PetObject"))) {
                    text_type = TextTypes.PLAYERDATA;
                }
                //npc names are stored
                else {
                    text_type = TextTypes.NAMES;
                }
            }
            //dialog stored separately
            else if (
                //big dialog (explaination of something)
                (stack.includes("Artifact$Dialog") && stack.includes("createTextField"))
                //small dialog "welcome to the merchant guild"
                || (stack.includes("Artifact$WindowMenu$init") && stack.includes("createTextField"))
            ) {
                text_type = TextTypes.DIALOG;
            }
            //items stored separately
            else if (
                stack.includes("Artifact$WindowArtifact$printItem")
                || stack.includes("Artifact$InterfaceBackpack$createLineBackpack")
                || stack.includes("Artifact$WindowSynthesis$createLine")
                || stack.includes("Artifact$InterfaceWarehouse$createLineWarehouse")
                || stack.includes("Artifact$InterfaceShop$createLineMyList")
                || stack.includes("Artifact$InterfaceShop$createLineGoods")
            ) {
                text_type = TextTypes.ITEMS;
            }
            //item descriptions
            else if (stack.includes("Artifact$WindowCardBack") && elem._style._fill.toLowerCase()=='#ffffff') {
                text_type = TextTypes.ITEM_DESC;
            }
            //player descriptions, i guess
            else if (stack.includes("Artifact$WindowArtifact$init\nArtifact$StartProcess$dataCompleteHandler\nArtifact$ArtifactData$dataLoaded")) {
                text_type = TextTypes.PLAYERDATA;
            }
            //pet info
            else if (stack.includes("WindowPet$addTextField\nWindowPet\ndoPetInfo")) {
                text_type = TextTypes.PLAYERDATA;
            }

            //begin tracking this text element
            let elem_tracker = new TextTracker(elem,stack,text_type);
            elem._text_tracker = elem_tracker;
            text_elements.push(elem_tracker);
            trs_check_element(elem_tracker);

            if (global_config.log_context && !stack.includes("TextTimerCounter") && (!global_config.log_exclude_names || !stack.includes("NameLabel")) ) {
                //text, original text, context
                trs_log(`new text:\n"${elem.text}"\noriginal:\n"${args[0]}"\ncontext:\n${stack}`);
            }

            //new proxy so we can listen to text changes
            return new Proxy(elem, {
                /*
                //(test) estimate size of english text
                get(target, prop, receiver) {
                    let val = target[prop];

                    if (prop === "width") {
                        let text = target.text;
                        if (trs_string_contains_jp(text)) {
                            val = val * 1.2;
                        }
                    }

                    return val;
                },*/
                set(target, prop, value) {
                    target[prop] = value;
                    //Listen for the text value being changed, so we can translate it ASAP.
                    //Most of the time, the game creates a blank PIXI.Text and then sets the text value.
                    if (prop === "text") {
                        if ( global_config.log_context && !stack.includes("TextTimerCounter") && (!global_config.log_exclude_names || !stack.includes("NameLabel")) ) {
                            trs_log(`set text to ${value}\nContext:\n${target._text_tracker.context_stack}`);
                        }
                        trs_check_element(target._text_tracker);
                    }
                    return true;
                }
            });
        }
    });

});


