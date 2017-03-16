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
    var sendFcMessage;
    var sendCcMessage;
    var sendPrivMessage;
    var addFriend;
    var rmFriend;
    var isFriend;
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

        var fcService = angular.element(document.body).injector().get("FriendsChatService");
        var ccService = angular.element(document.body).injector().get("ClanChatService");
        var pmService = angular.element(document.body).injector().get("PrivateChatService");
        var userService = angular.element(document.body).injector().get("UserService");
        sendFcMessage = function (x) {
            return fcService.send(x)
        };
        sendCcMessage = function (x) {
            return ccService.send(x)
        };
        sendPrivMessage = function (x, y) {
            return pmService.send(x, y)
        };
        addFriend = function (x) {
            return userService.addFriend(x)
        };
        rmFriend = function (x) {
            return userService.removeFriend(x)
        };
        isFriend = function (x) {
            return userService.isFriend(x)
        };

        $root.$on("friendsChatMessageReceived", function (_, message) {
            if (message.fromMe || message.notification) {
                return;
            }
            var commandFn = botCommands[message.content.toLowerCase()];
            if (commandFn) {
                commandFn("fc");
            }
        });

        $root.$on("privateChatMessageReceived", function (_, message) {
            if (message.fromMe || message.notification) {
                return;
            }
            var commandFn = botCommands[message.content.toLowerCase()];
            if (commandFn) {
                commandFn("pm", message.displayName);
            }
        });

        $root.$on("clanChatMessageReceived", function (_, message) {
            if (message.fromMe || message.notification) {
                return;
            }
            var commandFn = botCommands[message.content.toLowerCase()];
            if (commandFn) {
                commandFn("cc");
            }
        });
        var sendMessage = function (message, delivery) {
            var messageChunks = message.match(/.{1,80}/g);
            messageChunks.forEach(function (msg) {
                delivery(msg);
            });
        };

        $root.$on("sendMessage", function (_, message, src, user) {
            switch (src) {
                case "fc":
                    sendMessage(message, sendFcMessage);
                    break;
                case "cc":
                    sendMessage(message, sendCcMessage);
                    break;
                case "pm":
                    var sendAndRemoveFriend = function () {
                        sendMessage(message, function (msg) {
                            sendPrivMessage(user, msg);
                        });
                        rmFriend(user);
                    };
                    if (isFriend(user)) {
                        sendAndRemoveFriend();
                    }
                    else {
                        var unregister = $root.$on("friendsListUpdated", function () {
                            unregister();
                            setTimeout(sendAndRemoveFriend, 1000);
                        });
                        addFriend(user);
                    }
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

    var rotation = function (rotationLength, numRotations, offset) {
        var msInDay = 60 * 60 * 24 * 1000;
        var daysAfterEpoch = Math.floor(Date.now() / msInDay);
        var daysIntoRotationInterval = (daysAfterEpoch + offset) % (rotationLength * numRotations);
        var rotationNumber = Math.floor(daysIntoRotationInterval / rotationLength);
        var daysUntilNext = rotationLength - (daysIntoRotationInterval % rotationLength);
        return {rotationNumber: rotationNumber, daysUntilNext: daysUntilNext};
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
    addCommand("fooh", function (src, user) {
        queueMessage("sucks!", src, user);
    });

    // rax rotation
    addCommand("araxxi", function (src, user) {
        var rotations = ["2/3", "1/3", "1/2"];
        var rotationInfo = rotation(4, 3, 3);
        queueMessage(`current paths: ${rotations[rotationInfo.rotationNumber]}, changes in ${rotationInfo.daysUntilNext} days`, src, user);
    });
    aliasCommand("araxxi", ["rax", "raxi", "araxxor"]);

    // get VoS via tweetbot
    addCommand("vos", function (src, user) {
        $http({
            method: "GET",
            // Twitter API not used because I'm not leaking my API key
            url: corsUrl("https://cdn.syndication.twimg.com/widgets/timelines/733073833553321985?&lang=en&supress_response_codes=true")
        }).then(function (response) {
            var vosMessages = /\w+ and \w+ districts at \d{2}:\d{2} UTC/.exec(response.data.body);
            if (vosMessages) {
                queueMessage(vosMessages[0], src, user);
            }
        }, function () {
            queueMessage("failed to get vos", src, user);
        });
    });

    // get portables from the spreadsheet
    addCommand("portables", function (src, user) {
        $http({
            method: "GET",
            // my Google API key is limited to my IP so use your own
            url: "https://sheets.googleapis.com/v4/spreadsheets/16Yp-eLHQtgY05q6WBYA2MDyvQPmZ4Yr3RHYiBCBj2Hc/values/A16:G17?key=AIzaSyD6XRAuGAdWPK-ta2iysG4aARtvz361mkM&majorDimension=COLUMNS"
        }).then(function (response) {
            queueMessage(response.data.values.map(function (x) {
                return x.join(":");
            }).join("/"), src, user);
        }, function () {
            queueMessage("failed to get portables", src, user);
        });
    });
    aliasCommand("portables", ["ports", "p"]);
})();