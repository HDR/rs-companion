// ==UserScript==
// @name           RS Companion Chatbot
// @version        0.6.9
// @namespace      dogescripts
// @author         RevoDeeps
// @description    A basic interactive chatbot for FCs
// @include        https://secure.runescape.com/m=world*/a=*/html5/comapp/*
// @include        https://secure.runescape.com/m=world*/html5/comapp/*
// @grant          unsafeWindow
// ==/UserScript==

(function () {
    var init;
    var angular;

    var $root;
    var fcService;
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
        fcService = angular.element(document.body).injector().get("FriendsChatService");

        $root.$on("friendsChatMessageReceived", function (_, message) {
            var commandFn = botCommands[message.content.toLowerCase()];
            if (commandFn) {
                commandFn();
            }
        });

        $root.$on("sendMessage", function (_, message) {
            var messageChunks = message.match(/.{1,80}/g);
            messageChunks.forEach(function (msg) {
                fcService[Object.keys(fcService)[4]](msg);
            });
        });
    };

    var queueMessage = function (message) {
        $root.$broadcast("sendMessage", message);
    };

    // cors for cross origin restrictions on requests to websites that restrict it
    var corsUrl = function (url) {
        return "https://cors-anywhere.herokuapp.com/" + url;
    };

    var rotation = function (rotationLength, numRotations, offset) {
        var msInDay = 60 * 60 * 24 * 1000;
        var daysAfterEpoch = Math.floor(Date.now() / msInDay);
        var daysIntoRotationInterval = (daysAfterEpoch + offset) % (rotationLength * numRotations);
        var rotationNumber = Math.floor(daysIntoRotationInterval / rotationLength);
        var daysUntilNext = rotationLength - (daysIntoRotationInterval % rotationLength);
        return {rotationNumber: rotationNumber, daysUntilNext: daysUntilNext}
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

    // a very basic "hello world" command
    addCommand("fooh", function () {
        queueMessage("sucks!");
    });

    // rax rotation
    addCommand("araxxi", function () {
        var rotations = ["2/3", "1/3", "1/2"];
        var rotationInfo = rotation(4, 3, 3);
        queueMessage(`current: ${rotations[rotationInfo.rotationNumber]}, changes in ${rotationInfo.daysUntilNext} days`);
    });
    aliasCommand("araxxi", ["rax", "raxi", "araxxor"]);

    // get VoS via tweetbot
    addCommand("vos", function () {
        $http({
            method: "GET",
            // Twitter API not used because I'm not leaking my API key
            url: corsUrl("https://cdn.syndication.twimg.com/widgets/timelines/733073833553321985?&lang=en&supress_response_codes=true")
        }).then(function (response) {
            var vosMessages = /\w+ and \w+ districts at \d{2}:\d{2} UTC/.exec(response.data.body);
            if (vosMessages) {
                queueMessage(vosMessages[0]);
            }
        }, function () {
            queueMessage("failed to get vos");
        });
    });

    // get portables from the spreadsheet
    addCommand("portables", function () {
        $http({
            method: "GET",
            // my Google API key is limited to my IP so use your own
            url: "https://sheets.googleapis.com/v4/spreadsheets/16Yp-eLHQtgY05q6WBYA2MDyvQPmZ4Yr3RHYiBCBj2Hc/values/A16:G17?key=AIzaSyD6XRAuGAdWPK-ta2iysG4aARtvz361mkM&majorDimension=COLUMNS"
        }).then(function (response) {
            queueMessage(response.data.values.map(function (x) {
                return x.join(":");
            }).join("/"));
        }, function () {
            queueMessage("failed to get portables");
        });
    });
    aliasCommand("portables", ["ports", "p"]);
})();