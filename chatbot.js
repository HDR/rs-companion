// ==UserScript==
// @name           RS Companion Chatbot
// @version        0.1
// @author         HDR, RevoDeeps
// @description    A basic interactive chatbot for FCs
// @include        https://secure.runescape.com/m=world*/a=*/html5/comapp/*
// @include        https://secure.runescape.com/m=world*/html5/comapp/*
// @grant          GM_xmlhttpRequest
// @grant          unsafeWindow
// ==/UserScript==
 
(function () {
    var init;
    var angular;
    var $root;
    var sendCcMessage;
    var $http;
    var botCommands = {};
 
    // load the stuff
    var initWatcher = window.setInterval(function () {
        console.log("waiting for load");
        if (unsafeWindow.angular && unsafeWindow.angular.element(document.body).injector()) {
            angular = unsafeWindow.angular;
            window.clearInterval(initWatcher);
            init();
            // clear the initial loading screen because it loads inconsistently normally
            angular.element(document).find("body").removeClass("initial-load");
        }
    }, 100);
 
    // hook our setup listeners to the companion app
    init = function () {
        $root = angular.element(document.body).scope().$root;
        $http = angular.element(document.body).injector().get("$http");
 
        var ccService = angular.element(document.body).injector().get("ClanChatService");
        var userService = angular.element(document.body).injector().get("UserService");
        sendCcMessage = function (x) {
            return ccService.send(x)
        };
 
        $root.$on("clanChatMessageReceived", function (_, message) {
            if (message.fromMe || message.notification) {
                return;
            }
            var commandFn = botCommands[message.content.toLowerCase()];
            if (commandFn) {
                commandFn("cc");
            }
            msgJson = {
              "avatar_url": "http://i.imgur.com/TkiKjWM.png",
              "content": message.displayName + ": " + message.content
            };
            var url = "Your Discord Webhook Here";
            xhr = new XMLHttpRequest();
            xhr.open("POST", url, true);
            xhr.setRequestHeader("Content-type", "application/json");
            var data = JSON.stringify(msgJson);
            xhr.send(data);
        });
        var sendMessage = function (message, delivery) {
            var messageChunks = message.match(/.{1,80}/g);
            messageChunks.forEach(function (msg) {
                delivery(msg);
            });
        };
 
        $root.$on("sendMessage", function (_, message, src, user) {
            switch (src) {
                case "cc":
                    sendMessage(message, sendCcMessage);
                    break;
            }
        });
    };
 
    var queueMessage = function (message, src, user) {
        $root.$broadcast("sendMessage", message, src, user);
    };
 
    // cors for cross origin restrictions on requests to websites that restrict it
    var corsUrl = function (url) {
        return "https://cors-anywhere.herokuapp.com/" + url;
    };
 
     /*
     =================================================================================================
     basic API to add commands, pass in the exact string to use for the command and a function that
     determines the message to send, and uses the queueMessage callback to initiate the actual send
     =================================================================================================
     */
    var addCommand = function (cmd, fn) {
        botCommands[cmd.toLowerCase()] = fn;
    };
 
    /*
     =================================================================================================
     pass in the original command name and an array of aliases
     =================================================================================================
     */
    var aliasCommand = function (cmd, aliases) {
        aliases.forEach(function (alias) {
            botCommands[alias.toLowerCase()] = botCommands[cmd.toLowerCase()];
        });
 
    };
 
    addCommand("debug", function (src, user) {
        queueMessage("DebugMessage", src, user);
    });
})();
