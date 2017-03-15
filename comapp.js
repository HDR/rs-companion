// ==UserScript==
// @name           RS Companion Enhancer
// @version        1.0
// @namespace      dogescripts
// @author         RevoDeeps
// @description    Add stack value, tab value, and sell to GE to comapp bank view
// @include        https://secure.runescape.com/m=world*/a=*/html5/comapp/*
// @include        https://secure.runescape.com/m=world*/html5/comapp/*
// @grant          unsafeWindow
// ==/UserScript==

(function () {
    var init;
    var angular;

    var bankFuns;
    var geFuns;
    var $location;

    //load our mod after the main app is loaded
    var initWatcher = window.setInterval(function () {
        console.log("waiting for load");
        if (unsafeWindow.angular && unsafeWindow.angular.element(document.body).injector()) {
            angular = unsafeWindow.angular;
            window.clearInterval(initWatcher);
            init();
            //clear the initial loading screen because it loads inconsistently normally
            angular.element(document).find("body").removeClass("initial-load");
        }
    }, 100);

    var getGeFuns = function () {
        var geService = angular.element(document.body).injector().get("GEService");
        var geFunKeys = Object.keys(geService);
        return {
            getPrice: geService[geFunKeys[6]], //item id
            getSlotInfo: geService[geFunKeys[1]], //ge slot
            //pass in undefined slot for buy/sell -> autopick available slot for buy/sell
            buy: geService[geFunKeys[12]], //ge slot, item id, qty, offer price
            sell: geService[geFunKeys[14]], //ge slot, item id, qty, offer price, true

            abort: geService[geFunKeys[16]], //ge slot
            collect: geService[geFunKeys[18]] //ge slot, invIndex
        };
    };


    var getBankFuns = function () {
        var bankService = angular.element(document.body).injector().get("BankService");
        var bankFunKeys = Object.keys(bankService);
        return {
            getInfo: bankService[bankFunKeys[6]] //bank slot number
        };
    };

    init = function () {
        var formatVal = function (val) {
            if (val > 10000000000) {
                return (val / 1000000000).toFixed(1) + "B";
            }
            if (val > 10000000) {
                return (val / 1000000).toFixed() + "M";
            }
            if (val > 100000) {
                return (val / 1000).toFixed() + "k";
            }
            return val.toString();
        };
        var valColor = function (val) {
            if (val > 10000000000) {
                return "indianred";
            }
            if (val > 10000000) {
                return "springgreen";
            }
            if (val > 100000) {
                return "white";
            }
            return "yellow";
        };

        var $root = angular.element(document.body).scope().$root;

        var sortVar = "index";
        var priceCache = {};

        $root.$on("bankTabsUpdated", function (event, data) {
            var bankScope = event.targetScope.$$childTail;
            var idxKeys = Object.keys(data.tabs[0]);
            var allTab = {
                id: 0,
                name: "All"
            };
            allTab[idxKeys[0]] = 0;
            allTab[idxKeys[1]] = data.usedSlotCount - 1;
            data.tabs.unshift(allTab);
            bankScope.totalValue = "Loading";
            bankScope.sortVar = sortVar;
            bankScope.toggleSort = function () {
                sortVar = (bankScope.sortVar = {"index": "stackVal", "stackVal": "index"}[bankScope.sortVar]);
            };

            // tab is not immediately exposed at the time this handler runs
            // run in a separate watcher
            bankScope.$on("bankTabsUpdated", function (event) {
                var bankScope = event.targetScope.$$childTail;
                if (bankScope.currentTab) {
                    var tabSize = bankScope.currentTab[Object.keys(bankScope.currentTab)[4]];
                    var loadFnIdx = document.querySelector("#sell-bank") ? 21 : 20;
                    while (bankScope.items.length < tabSize) {
                        bankScope[Object.keys(bankScope)[loadFnIdx]]();
                    }
                    itemListener(bankScope.items);
                }
            });


            //functions and variables to load item prices
            var updatedItems = 0;
            var totalItems = -1;

            var itemsToCheck = [];
            var itemsParallel = 69;

            var itemListener = function (newVal) {
                updatedItems = 0;
                totalItems = newVal.length;
                for (var item of newVal) {
                    if (!setPrice(item)) {
                        itemsToCheck.push(item.index);
                    }
                }
                getPrices();
            };
            var getPrices = function () {
                var items = itemsToCheck.splice(0, itemsParallel);
                itemsParallel -= items.length;
                for (var item of items) {
                    bankFuns.getInfo(item);
                }
            };
            bankScope.$on("bankSlotUpdated", function (event, objdata) {
                itemsParallel++;
                priceCache[objdata.id] = {
                    marketPrice: objdata.marketPrice,
                    memberStatus: objdata.memberStatus,
                    stockmarket: objdata.stockmarket
                };
                setPrice(objdata);
                getPrices();
            });
            var setPrice = function (item) {
                if (priceCache[item.id]) {
                    var itemSlotId = item[Object.keys(item)[0]];
                    //append price and stack value info
                    var itemIndex = bankScope.items.findIndex(function (elem) {
                        return elem.index === itemSlotId;
                    });
                    if (itemIndex !== -1) {
                        var item = bankScope.items[itemIndex];
                        var itemPriceData = priceCache[item.id];
                        for (var attrname in itemPriceData) {
                            item[attrname] = itemPriceData[attrname];
                        }
                        item.stackVal = item.count * item.marketPrice;
                        item.formattedStackVal = formatVal(item.stackVal);
                        item.stackCol = valColor(item.stackVal);
                    }
                    updatedItems++;
                    if (updatedItems === totalItems) {
                        updatedItems = 0;
                        totalItems = 0;
                        bankScope.$apply(function () {
                            bankScope.totalUValue = bankScope.items.reduce(function (a, b) {
                                return b.stackVal ? a + b.stackVal : a;
                            }, 0).toLocaleString();
                            bankScope.totalValue = bankScope.items.reduce(function (a, b) {
                                return (b.stackVal && b.stockmarket) ? a + b.stackVal : a;
                            }, 0).toLocaleString();
                        });
                    }
                    return true;
                }
                return false;
            };
        });

        //capture and display recent offer price history
        var loadTradeHistory = function (name) {
            var history = JSON.parse(localStorage.getItem(name));
            if (history) {
                history.date = new Date(history.date).toLocaleString();
            }
            return history;
        };

        //add favorite items to buy view
        $root.$on("userTradeRestrictedStatusUpdated", function (event) {
            var geScope = event.targetScope.$$childTail;
            geScope.$on("geSlotUpdated", function (_, slot) {
                if (!slot.isEmpty && slot.offerCompletedCount && (slot.isComplete || slot.isAborted)) {
                    var id = slot.offerItem.id;
                    var price = slot.offerCompletedGold / slot.offerCompletedCount;
                    var selling = slot[Object.keys(slot)[2]] == 1;
                    var offerType = selling ? "Selling" : "Buying";

                    localStorage.setItem(id + "|" + offerType, JSON.stringify({
                        price: price,
                        date: new Date().valueOf()
                    }));
                }
            });

            geScope.collectAll = function () {
                for (var slotInd in geScope.slots) {
                    var slot = geScope.slots[slotInd];
                    for (var item of slot.collectInv) {
                        geFuns.collect(slot.slotId, item.invIndex);
                    }
                }
                geScope.$broadcast("pinUnlocked");
            };

            geScope.abortOffer = function (slot) {
                geFuns.abort(slot.slotId);
                geScope.$broadcast("pinUnlocked");
            };
        });

        $root.$on("itemDetailsRetrieved", function (_, item) {
            var id = item.id;
            item.lastSell = loadTradeHistory(id + "|Selling");
            item.lastBuy = loadTradeHistory(id + "|Buying");

            item.instaSell = Math.floor(item.marketPrice * .8);
            item.instaBuy = Math.floor(item.marketPrice * 1.2);
        });

        //add favorite items to buy view
        $root.$on("userGEBuySellAccessStatusUpdated", function (event) {
            var geScope = event.targetScope.$$childTail;
            geScope.favorites = favorites;

            geScope.instaSellItem = function () {
                geFuns.sell(geScope.slotId, geScope.item.id, 1, geScope.item.instaSell, true);
                $location.path("/grand-exchange");
            };
            geScope.instaBuyItem = function () {
                geFuns.buy(geScope.slotId, geScope.item.id, 1, geScope.item.instaBuy);
                $location.path("/grand-exchange");
            };

        });
        var getFavorites = function () {
            try {
                return JSON.parse(localStorage.getItem("GEFavorites")) || {};
            } catch (e) {
                return {};
            }
        };
        var setFavorites = function () {
            localStorage.setItem("GEFavorites", JSON.stringify(favorites));
        };
        var favorites = getFavorites();
        var addFavorite = function (item) {
            favorites[item.id] = item.name;
            setFavorites();
        };
        var removeFavorite = function (item) {
            delete favorites[item.id];
            setFavorites();
        };
        $root.toggleFavorite = function (item) {
            if ($root.checkFavorite(item)) {
                removeFavorite(item);
            }
            else {
                addFavorite(item);
            }
        };
        $root.checkFavorite = function (item) {
            return favorites[item.id];
        };


        //quick GE sell from bank view
        $root.qtyOptions = [
            {
                label: "1", fun: function (qty) {
                return 1;
            }
            },
            {
                label: "All but 1", fun: function (qty) {
                return qty - 1;
            }
            },
            {
                label: "All", fun: function (qty) {
                return qty;
            }
            }];
        $root.priceOptions = [
            {
                label: "1 gp", fun: function (price) {
                return 1;
            }
            },
            {
                label: "-10%", fun: function (price) {
                return Math.floor(price * 0.9);
            }
            },
            {
                label: "-5%", fun: function (price) {
                return Math.floor(price * 0.95);
            }
            },
            {
                label: "Market", fun: function (price) {
                return price;
            }
            },
            {
                label: "+5%", fun: function (price) {
                return Math.floor(price * 1.05);
            }
            }];
        $root.sellOffer = function (id, qty, price) {
            geFuns.sell(undefined, id, qty, price, true);
            $root.$broadcast("pinUnlocked");
        };


        //load modified HTML partials
        $root.$on("$locationChangeStart", function (event, data) {
            bankFuns = getBankFuns();
            geFuns = getGeFuns();
            $location = angular.element(document.body).injector().get("$location");


            var $templateCache = angular.element(document.body).injector().get("$templateCache");
            $templateCache.put("partials/bank/item.ws", "<a class=\"close\" ng-click=\"close()\"><i class=\"icon-discard\"></i></a>\n<div class=\"icon\">\n    <img ng-src=\"[[ item.imgUrl ]]\">\n    <span class=\"count\" ng-if=\"item.count > 1\">[[ formatNumber(item.count) ]]</span>\n    <div class=\"members icon-members\" ng-if=\"item.memberStatus\"></div>\n</div>\n<h2 ng-if=\"!item\" class=\"title\">Loading...</h2>\n<h2 ng-if=\"item\" class=\"title\">[[ item.name ]]</h2>\n<span ng-if=\"item && item.stockmarket\" class=\"subtitle\">\nTotal value: [[ (item.marketPrice * item.count) | number ]] gp\n<em ng-if=\"item.count > 1\">([[ item.marketPrice | number ]] gp each)</em>\n</span>\n<div ng-if=\"item && item.stockmarket\" class=\"pill-wrap triple\">\n    <a href=\"#!/grand-exchange/buy/[[ item.id ]]\" class=\"button pill\" ng-if=\"canTradeItem\">Buy</a>\n    <span class=\"button pill dark\" ng-if=\"!canTradeItem\">Buy</span>\n    <a href=\"#!/stockmarket/item/[[ item.id ]]\" class=\"button pill\"><i class=\"icon-stockmarket\"></i></a>\n    <a href=\"#!/grand-exchange/sell/[[ bankSlot ]]\" class=\"button pill\" ng-if=\"canTradeItem\">Sell</a>\n    <span class=\"button pill dark\" ng-if=\"!canTradeItem\">Sell</span>\n</div>\n<p ng-if=\"canTradeItem\" style=\'padding-top: 5px;\'>Quick sell</p>\n<div class=\"pill-wrap triple\" ng-if=\"item && item.stockmarket && canTradeItem\">\n    <select ng-init=\"offerQty = $root.qtyOptions[2]\" ng-model=\"offerQty\" style=\'height: 30px\'\n            ng-options=\"op.label for op in $root.qtyOptions\" class=\"button pill\"></select>\n    <select ng-init=\"offerPrice = $root.priceOptions[3]\" ng-model=\"offerPrice\" style=\'height: 30px\'\n            ng-options=\"op.label for op in $root.priceOptions\" class=\"button pill\"></select>\n    <span ng-click=\"$root.sellOffer(item.id, offerQty.fun(item.count), offerPrice.fun(item.marketPrice));close()\"\n          class=\"button pill\">Submit offer</span>\n</div>\n<p ng-if=\"item && !item.stockmarket\" class=\"error\"><i class=\"icon-attention\"></i> Item cannot be traded on the GE.</p>");
            $templateCache.put("quick_abort.ws", "<h1>Abort Offer</h1>\n<div class=\"inner\">\n    <p>\n        Are you sure you want to abort your offer?\n    </p>\n    <div class=\"pill-wrap double\">\n        <a ng-click=\"modalCancel()\" class=\"button pill\">Cancel</a>\n        <a ng-click=\"modalSuccess()\" class=\"button pill\">OK</a>\n    </div>\n</div>");
            $templateCache.put("views/ge_sell_item.ws", "<section class=\"ge-slot ge-buy\">\n    <header class=\"header\">\n        <a class=\"back\" ng-click=\"back()\"><i class=\"icon-back\"></i></a>\n        <a scrolls-to-top>GE Sell</a>\n        <a style=\"float: right; margin-right: 15px;\" ng-click=\"$root.toggleFavorite(item)\" ng-if=\"item\">\n            <i ng-class=\"$root.checkFavorite(item) ? \'icon-minus\' : \'icon-plus\'\"></i></a>\n    </header>\n    <div class=\"content push-top-single push-bottom-tiny\">\n        <div class=\"generic-detail selling item\" ng-if=\"item && !isTradeRestricted && geBuySellEnabled\">\n            <div class=\"icon\">\n                <img ng-src=\"[[ item.imageUrl ]]\"/>\n                <span class=\"count\" ng-if=\"bankSlot.count > 1\">[[ formatNumber(bankSlot.count) ]]</span>\n                <div class=\"members icon-members\" ng-if=\"item.members\"></div>\n            </div>\n            <div class=\"details double with-button\">\n                <h2 class=\"title\">[[ item.name ]]</h2>\n                <span class=\"subtitle\">Selling</span>\n                <a class=\"goto-stockmarket\" href=\"#!/stockmarket/item/[[ item.id ]]\"><i\n                        class=\"icon-stockmarket\"></i></a>\n            </div>\n            <div class=\"wrap\">\n                <form ng-submit=\"submitOffer()\">\n                    <p>Quantity</p>\n                    <input type=\"number\" name=\"quantity\" class=\"centered-text\" min=\"0\" step=\"1\" pattern=\"\\d+\" required\n                           ng-model=\"transaction.quantity\"/>\n                    <hr/>\n                    <p>Offered price per item</p>\n                    <div ng-if=\"item.lastBuy\" style=\"margin-bottom: 15px\" ng-click=\"transaction.pricePerItem = item.lastBuy.price\">\n                        <span>Last Buy price ([[ item.lastBuy.date ]]):</span>\n                        <span style=\"float: right; margin-right: 15px\">[[ item.lastBuy.price ]]</span>\n                    </div>\n                    <div ng-if=\"item.lastSell\" style=\"margin-bottom: 15px\" ng-click=\"transaction.pricePerItem = item.lastSell.price\">\n                        <span>Last Sell price ([[ item.lastSell.date ]]):</span>\n                        <span style=\"float: right; margin-right: 15px\">[[ item.lastSell.price ]]</span>\n                    </div>\n                    <input type=\"number\" name=\"price\" class=\"centered-text\" min=\"0\" step=\"1\" pattern=\"\\d+\" required\n                           ng-model=\"transaction.pricePerItem\"/>\n                    <div class=\"pill-wrap triple\">\n                        <a ng-click=\"minus5Percent()\" class=\"button pill\">-5%</a>\n                        <a ng-click=\"setToGuidePrice()\" class=\"button pill\"><i class=\"icon-guideprice\"></i></a>\n                        <a ng-click=\"plus5Percent()\" class=\"button pill\">+5%</a>\n                    </div>\n                    <div class=\"button pill\" style=\"margin-top: 10px;\" ng-click=\"instaSellItem()\">Instasell for [[ item.instaSell ]]</div>\n                    <hr/>\n                    <p>Estimated total price</p>\n                    <span class=\"total\" ng-if=\"transaction.total > priceLimit\">Too High</span>\n                    <span class=\"total\" ng-if=\"!transaction.total || priceLimit >= transaction.total\">[[ transaction.total | number ]]</span>\n                    <input type=\"submit\" class=\"primary\" value=\"Confirm offer\" ng-disabled=\"!transaction.valid\"/>\n                </form>\n            </div>\n        </div>\n        <p ng-if=\"isTradeRestricted\" class=\"empty-message error\">You cannot access the Grand Exchange from this\n            account.</p>\n        <p ng-if=\"!geBuySellEnabled && !isTradeRestricted\" class=\"empty-message error\">\n<span ng-if=\"!is2FactorEnabled\">\nYou need to <a href=\"https://secure.runescape.com/m=totp-authenticator/\" target=\"_blank\">add the RuneScape Authenticator to your account</a> before you can use the Grand Exchange to buy and sell items.\n</span>\n<span ng-if=\"!isComappTradingEnabled\">\nYou need to enable access by talking to the Grand Exchange Tutor in-game before you can use the Grand Exchange\nto buy and sell items.\n</span>\n        </p>\n        <p ng-if=\"errorMessage\" class=\"empty-message error\">An error occurred while retrieving item details.</p>\n    </div>\n    <footer class=\"footer tiny-footer gradient\">\n        Money Pouch:\n        <span class=\"right\">[[ playerGP | number ]] gp</span>\n    </footer>\n</section>");
            $templateCache.put("views/ge_buy_item.ws", "<section class=\"ge-slot ge-buy\">\n    <header class=\"header\">\n        <a class=\"back\" ng-click=\"back()\"><i class=\"icon-back\"></i></a>\n        <a scrolls-to-top>GE Buy</a>\n        <a style=\"float: right; margin-right: 15px;\" ng-click=\"$root.toggleFavorite(item)\" ng-if=\"item\">\n            <i ng-class=\"$root.checkFavorite(item) ? \'icon-minus\' : \'icon-plus\'\"></i></a>\n    </header>\n    <div class=\"content push-top-single push-bottom-tiny\">\n        <div class=\"generic-detail buying item\" ng-if=\"item && !isTradeRestricted && geBuySellEnabled\">\n            <div class=\"icon\">\n                <img ng-src=\"[[ item.imageUrl ]]\"/>\n                <div class=\"members icon-members\" ng-if=\"item.members\"></div>\n            </div>\n            <div class=\"details double with-button\">\n                <h2 class=\"title\">[[ item.name ]]</h2>\n                <span class=\"subtitle\">Buying</span>\n                <a class=\"goto-stockmarket\" href=\"#!/stockmarket/item/[[ item.id ]]\"><i\n                        class=\"icon-stockmarket\"></i></a>\n            </div>\n            <div class=\"wrap\">\n                <form ng-submit=\"submitOffer()\">\n                    <p>Quantity</p>\n                    <input type=\"number\" name=\"quantity\" class=\"centered-text\" min=\"0\" step=\"1\" pattern=\"\\d+\" required\n                           ng-model=\"transaction.quantity\"/>\n                    <hr/>\n                    <p>Offered price per item</p>\n                    <div ng-if=\"item.lastBuy\" style=\"margin-bottom: 15px\" ng-click=\"transaction.pricePerItem = item.lastBuy.price\">\n                        <span>Last Buy price ([[ item.lastBuy.date ]]):</span>\n                        <span style=\"float: right; margin-right: 15px\">[[ item.lastBuy.price ]]</span>\n                    </div>\n                    <div ng-if=\"item.lastSell\" style=\"margin-bottom: 15px\" ng-click=\"transaction.pricePerItem = item.lastSell.price\">\n                        <span>Last Sell price ([[ item.lastSell.date ]]):</span>\n                        <span style=\"float: right; margin-right: 15px\">[[ item.lastSell.price ]]</span>\n                    </div>\n                    <input type=\"number\" name=\"price\" class=\"centered-text\" min=\"0\" step=\"1\" pattern=\"\\d+\" required\n                           ng-model=\"transaction.pricePerItem\"/>\n                    <div class=\"pill-wrap triple\">\n                        <a ng-click=\"minus5Percent()\" class=\"button pill\">-5%</a>\n                        <a ng-click=\"setToGuidePrice()\" class=\"button pill\"><i class=\"icon-guideprice\"></i></a>\n                        <a ng-click=\"plus5Percent()\" class=\"button pill\">+5%</a>\n                    </div>\n                    <div class=\"button pill\" style=\"margin-top: 10px;\" ng-click=\"instaBuyItem()\">Instabuy for [[ item.instaBuy ]]</div>\n                    <hr/>\n                    <p>Estimated total price</p>\n                    <span class=\"total\" ng-if=\"transaction.total > priceLimit\">Too High</span>\n                    <span class=\"total\" ng-if=\"!transaction.total || priceLimit >= transaction.total\">[[ transaction.total | number ]]</span>\n                    <input type=\"submit\" class=\"primary\" value=\"Confirm offer\" ng-disabled=\"!transaction.valid\"/>\n                </form>\n            </div>\n        </div>\n        <p ng-if=\"isTradeRestricted\" class=\"empty-message error\">You cannot access the Grand Exchange from this\n            account.</p>\n        <p ng-if=\"!geBuySellEnabled && !isTradeRestricted\" class=\"empty-message error\">\n<span ng-if=\"!is2FactorEnabled\">\nYou need to <a href=\"https://secure.runescape.com/m=totp-authenticator/\" target=\"_blank\">add the RuneScape Authenticator to your account</a> before you can use the Grand Exchange to buy and sell items.\n</span>\n<span ng-if=\"!isComappTradingEnabled\">\nYou need to enable access by talking to the Grand Exchange Tutor in-game before you can use the Grand Exchange\nto buy and sell items.\n</span>\n        </p>\n        <p ng-if=\"errorMessage\" class=\"empty-message error\">An error occurred while retrieving item details.</p>\n    </div>\n    <footer class=\"footer tiny-footer gradient\">\n        Money Pouch:\n        <span class=\"right\">[[ playerGP | number ]] gp</span>\n    </footer>\n</section>");
            $templateCache.put("views/ge_slots.ws", "<section class=\"ge-slots\">\n    <header class=\"header\">\n        <a class=\"back goto-home\" toggles-menu><i class=\"icon-home\"></i></a>\n        <a scrolls-to-top>Grand Exchange</a>\n    </header>\n    <div class=\"content push-top-single push-bottom-tiny\" style=\'bottom: 60px\'>\n        <ul class=\"generic-list large-icon normal-spacing slots\" ng-if=\"!isTradeRestricted\">\n            <li ng-repeat=\"slot in slots track by $index\" class=\"slot clearfix\" ng-swipe-left=\"abortOffer(slot)\"\n                ng-class=\"{ \'complete\': slot.isComplete, \'aborted\': slot.isAborted, \'members-only\': slot.memberRestricted, \'buying\': slot.isBuying, \'selling\': slot.isSelling, \'empty\': slot.isEmpty }\">\n                <div ng-include=\"\'partials/ge/buying_slot.ws\'\" ng-if=\"slot.isBuying\"></div>\n                <div ng-include=\"\'partials/ge/selling_slot.ws\'\" ng-if=\"slot.isSelling\"></div>\n                <div ng-include=\"\'partials/ge/empty_slot.ws\'\" ng-if=\"slot.isEmpty\"></div>\n            </li>\n        </ul>\n        <p class=\"empty-message error\" ng-if=\"isTradeRestricted\">You cannot access the Grand Exchange from this\n            account.</p>\n    </div>\n    <footer class=\"footer tiny-footer gradient\" style=\'height: 60px\'>\n        Money Pouch:\n        <span class=\"right\">[[ playerGP | number ]] gp</span>\n        <a ng-click=\'collectAll()\' class=\"button pill\">Collect all</a>\n    </footer>\n</section>");
            $templateCache.put("views/bank_list.ws", "<section class=\"bank\">\n    <header class=\"header\">\n        <a class=\"back goto-home\" toggles-menu><i class=\"icon-home\"></i></a>\n        <a scrolls-to-top ng-click=\'toggleSort()\'>\n            Bank -\n            <span ng-if=\"!fromSearch\">Tab [[ currentTab.id ]]</span>\n            <span ng-if=\"fromSearch\">Search</span>\n        </a>\n        <a style=\"float: right; margin-right: 15px;\" ng-if=\"totalValue !== null\"\n           ng-click=\'showUntradable = !showUntradable\'>[[\n            showUntradable ? totalUValue : totalValue ]]</a>\n    </header>\n    <div class=\"sub-header grey\">\n        <form class=\"wrapped-bar-form\" ng-submit=\"search()\">\n            <div class=\"wrap full\">\n                <label for=\"search\" class=\"magnifying-glass\"><i class=\"icon-search\"></i></label>\r\n<span>\r\n<input type=\"search\" id=\"search\" name=\"search\" placeholder=\"Item name. e.g. \'Mithril\'\" maxlength=\"200\" required\n       ng-model=\"searchTerm\"/>\r\n</span>\n            </div>\n        </form>\n    </div>\n    <div id=\"bank-list\" class=\"content push-top-double push-bottom-single-and-tiny\">\n        <div class=\"slot-usage\">\n            Bank slots used:\n            <span class=\"right\" ng-class=\" { \'error\': (usedSlotCount >= totalSlotCount) }\">[[ usedSlotCount ]] / [[ totalSlotCount ]]</span>\n        </div>\n        <ul class=\"grid items\" infinite-scroll ng-if=\"items.length\">\n            <li ng-repeat=\"item in items|orderBy:sortVar\">\n                <a title=\"[[ item.name ]]\" displays-bank-item item-index=\"[[ item.index ]]\">\n                    <img ng-src=\"[[ item.imgUrl ]]\" container=\"bank-list\">\n                    <span class=\"count\" ng-if=\"item.count > 1\">[[ item.formattedCount ]]</span>\n                    <span class=\"count\" ng-if=\"item.stackVal > 1\"\n                          style=\"top: initial;left: initial;bottom: 5px;right: 5px;color: [[ item.stackCol ]];opacity: [[item.stockmarket ? 1 : 0.5]];\">[[ item.formattedStackVal ]]</span>\n                </a>\n            </li>\n        </ul>\n        <p ng-if=\"hasSearched && !items.length\" class=\"empty-message error\">Your search returned no results.</p>\n        <p ng-if=\"!hasSearched && bankEmpty\" class=\"empty-message error\">There are no items in your bank.</p>\n    </div>\n    <div class=\"sub-footer tiny-footer gradient\">\n        Money Pouch:\n        <span class=\"right\">[[ playerGP | number ]] gp</span>\n    </div>\n    <footer class=\"footer\">\n        <div class=\"pill-wrap single\">\n            <a href=\"#!/bank/tab/[[ prevTab() ]]\" class=\"button pill\" ng-if=\"tabs.length > 1\"><i class=\"icon-back\"></i></a>\n            <span class=\"button pill disabled\" ng-if=\"tabs.length === 1\"><i class=\"icon-back\"></i></span>\n        </div>\n        <div class=\"select-wrap\">\n            <select ng-model=\"currentTab\" ng-options=\"\'Tab \' + tab.id + \' - \' + tab.name for tab in tabs|orderBy:\'id\'\"\n                    ng-change=\"tabChanged(currentTab)\"></select>\n        </div>\n        <div id=\"tab-uncategorised\" class=\"hidden\">Uncategorised</div>\n        <div class=\"pill-wrap single\">\n            <a href=\"#!/bank/tab/[[ nextTab() ]]\" class=\"button pill\" ng-if=\"tabs.length > 1\"><i\n                    class=\"icon-forward\"></i></a>\n            <span class=\"button pill disabled\" ng-if=\"tabs.length === 1\"><i class=\"icon-forward\"></i></span>\n        </div>\n    </footer>\n</section>");
            $templateCache.put("views/ge_sell.ws", "<section class=\"bank\" id=\"sell-bank\">\n    <header class=\"header\">\n        <a class=\"back\" ng-click=\"back()\"><i class=\"icon-back\"></i></a>\n        <a scrolls-to-top ng-click=\'toggleSort()\'>GE Sell</a>\n        <a style=\"float: right; margin-right: 15px;\" ng-if=\"totalValue !== null\" ng-click=\'showUntradable = !showUntradable\'>[[ showUntradable ? totalUValue : totalValue ]]</a>\n    </header>\n    <div class=\"sub-header grey\">\n        <form class=\"wrapped-bar-form\" ng-submit=\"search()\">\n            <div class=\"wrap full\">\n                <label for=\"search\" class=\"magnifying-glass\"><i class=\"icon-search\"></i></label>\n<span>\n<input type=\"search\" id=\"search\" name=\"search\" placeholder=\"Item name. e.g. \'Mithril\'\" maxlength=\"200\" required\n       ng-model=\"searchTerm\"/>\n</span>\n            </div>\n        </form>\n    </div>\n    <div id=\"bank-list\" class=\"content push-top-double push-bottom-single-and-tiny\">\n        <div class=\"slot-usage\" ng-if=\"!isTradeRestricted && geBuySellEnabled\">\n            Bank slots used:\n            <span class=\"right\" ng-class=\" { \'error\': (usedSlotCount >= totalSlotCount) }\">[[ usedSlotCount ]] / [[ totalSlotCount ]]</span>\n        </div>\n        <ul class=\"grid items\" infinite-scroll ng-if=\"items.length && !isTradeRestricted && geBuySellEnabled\">\n            <li ng-repeat=\"item in items|orderBy:sortVar|filter:{stockmarket:1}\">\n                <a title=\"[[ item.name ]]\" displays-bank-item item-index=\"[[ item.index ]]\"\n                   template=\"partials/bank/item_sell.ws\" slot=\"[[ slotId ]]\">\n                    <img ng-src=\"[[ item.imgUrl ]]\" container=\"bank-list\">\n                    <span class=\"count\" ng-if=\"item.count > 1\">[[ item.formattedCount ]]</span>\n                    <span class=\"count\" ng-if=\"item.stackVal > 1\"\n                          style=\"top: initial;left: initial;bottom: 5px;right: 5px;color: [[ item.stackCol ]];opacity: [[item.stockmarket ? 1 : 0.5]];\">[[ item.formattedStackVal ]]</span>\n                </a>\n            </li>\n        </ul>\n        <p ng-if=\"hasSearched && !items.length && !isTradeRestricted && geBuySellEnabled\" class=\"empty-message error\">\n            Your search returned no results.</p>\n        <p ng-if=\"!hasSearched && bankEmpty && !isTradeRestricted && geBuySellEnabled\" class=\"empty-message error\">There\n            are no items in your bank.</p>\n        <p ng-if=\"isTradeRestricted\" class=\"empty-message error\">You cannot access the Grand Exchange from this\n            account.</p>\n        <p ng-if=\"!geBuySellEnabled && !isTradeRestricted\" class=\"empty-message error\">\n<span ng-if=\"!is2FactorEnabled\">\nYou need to <a href=\"https://secure.runescape.com/m=totp-authenticator/\" target=\"_blank\">add the RuneScape Authenticator to your account</a> before you can use the Grand Exchange to buy and sell items.\n</span>\n<span ng-if=\"!isComappTradingEnabled\">\nYou need to enable access by talking to the Grand Exchange Tutor in-game before you can use the Grand Exchange\nto buy and sell items.\n</span>\n        </p>\n    </div>\n    <div class=\"sub-footer tiny-footer gradient\">\n        Money Pouch:\n        <span class=\"right\">[[ playerGP | number ]] gp</span>\n    </div>\n    <footer class=\"footer\">\n        <div class=\"pill-wrap single\" ng-if=\"geBuySellEnabled\">\n            <a href=\"#!/grand-exchange/sell/tab/[[ prevTab() ]]?slot=[[ slotId ]]\" class=\"button pill\"\n               ng-disabled=\"tabs.length === 1\"><i class=\"icon-back\"></i></a>\n        </div>\n        <div class=\"select-wrap\" ng-if=\"geBuySellEnabled\">\n            <select ng-model=\"currentTab\" ng-options=\"\'Tab \' + tab.id + \' - \' + tab.name for tab in tabs|orderBy:\'id\'\"\n                    ng-change=\"tabChanged(currentTab)\"></select>\n        </div>\n        <div id=\"tab-uncategorised\" class=\"hidden\">Uncategorised</div>\n        <div class=\"pill-wrap single\" ng-if=\"geBuySellEnabled\">\n            <a href=\"#!/grand-exchange/sell/tab/[[ nextTab() ]]?slot=[[ slotId ]]\" class=\"button pill\"\n               ng-disabled=\"tabs.length === 1\"><i class=\"icon-forward\"></i></a>\n        </div>\n    </footer>\n</section>");
            $templateCache.put("views/ge_buy.ws", "<section class=\"stockmarket\">\n    <header class=\"header\">\n        <a class=\"back\" ng-click=\"back()\"><i class=\"icon-back\"></i></a>\n        <a scrolls-to-top>GE Buy</a>\n    </header>\n    <div class=\"sub-header grey\">\n        <form class=\"wrapped-bar-form\" ng-submit=\"search()\">\n            <div class=\"wrap full\">\n                <label for=\"search\" class=\"magnifying-glass\"><i class=\"icon-search\"></i></label>\n<span>\n<input type=\"search\" id=\"search\" name=\"search\" placeholder=\"Item name. e.g. \'Mithril\'\" maxlength=\"200\" required\n       ng-model=\"searchTerm\"/>\n</span>\n            </div>\n        </form>\n    </div>\n    <div class=\"content push-top-double push-bottom-tiny\" ng-if=\"!isTradeRestricted && geBuySellEnabled\">\n        <ul class=\"generic-list normal-icon normal-spacing items\" infinite-scroll per-page=\"10\"\n            ng-if=\"searchResults.length\">\n            <li class=\"item\" ng-repeat=\"item in searchResults track by $index\">\n                <a ng-click=\"goLeft(\'/grand-exchange/buy/[[ item.id ]]?slot=[[ slotId ]]\')\">\n                    <div class=\"icon\">\n                        <img ng-src=\"[[ getItemImageURL(item.id) ]]\"/>\n                        <div class=\"members icon-members\" ng-if=\"item.members\"></div>\n                    </div>\n                    <div class=\"details\">\n                        <h2 class=\"title\">[[ item.name ]]</h2>\n<span class=\"subtitle\">\n[[ item.current.price ]] gp\n<span ng-class=\"item.today.trend\">[[ item.today.price ]] gp</span>\n</span>\n                        <i class=\"icon-forward\"></i>\n                    </div>\n                </a>\n            </li>\n        </ul>\n        <p ng-if=\"!hasSearched && !errorMessage && !searchResults.length\" class=\"empty-message\">Search for an item to\n            buy.</p>\n        <p class=\"empty-message tight\" ng-if=\"showHistory\" ng-class=\"{ \'border-top\': !hasSearched }\">Your favorited items:</p>\n        <ul class=\"generic-list normal-icon normal-spacing items\" ng-if=\"showHistory\">\n            <li class=\"item\" ng-repeat=\"(id, name) in favorites\" class=\"bought\">\n                <a ng-click=\"goLeft(\'/grand-exchange/buy/[[ id ]]?slot=[[ slotId ]]\')\">\n                    <div class=\"icon\">\n                        <img ng-src=\"[[ getItemImageURL(id, 1) ]]\"/>\n                    </div>\n                    <div class=\"details\">\n                        <h2 class=\"title\" style=\"display: inline-block\">[[ name ]]</h2>\n                        <i class=\"icon-forward\"></i>\n                    </div>\n                </a>\n            </li>\n        </ul>\n        <p class=\"empty-message tight\" ng-if=\"showHistory\" ng-class=\"{ \'border-top\': !hasSearched }\">Your previous\n            completed transactions:</p>\n        <ul class=\"generic-list normal-icon normal-spacing items\" ng-if=\"showHistory\">\n            <li class=\"item\" ng-repeat=\"transaction in transactionHistory track by $index\"\n                ng-class=\"{ \'bought\': transaction.bought, \'sold\': transaction.sold }\">\n                <a ng-click=\"goLeft(\'/grand-exchange/buy/[[ transaction.item.id ]]?slot=[[ slotId ]]\')\"\n                   ng-if=\"transaction.item.canTrade\">\n                    <div class=\"icon\">\n                        <img ng-src=\"[[ getItemImageURL(transaction.item.id, transaction.count) ]]\"/>\n                        <span class=\"count\" ng-if=\"transaction.count > 1\">[[ formatNumber(transaction.count) ]]</span>\n                        <div class=\"members icon-members\" ng-if=\"transaction.item.members\"></div>\n                    </div>\n                    <div class=\"details\">\n                        <h2 class=\"title\" style=\"display: inline-block\">[[ transaction.item.name ]]</h2>\n                        <span class=\"subtitle\" style=\"display: inline-block\">~[[ transaction.total / transaction.count ]] each</span>\n<span class=\"subtitle\" style=\"display: block\">\n<span ng-if=\"transaction.bought\">Bought for</span>\n<span ng-if=\"transaction.sold\">Sold for</span>\n[[ transaction.total ]] gp \n</span>\n                        <i class=\"icon-forward\"></i>\n                    </div>\n                </a>\n                <div ng-if=\"!transaction.item.canTrade\" class=\"dull\">\n                    <div class=\"icon\">\n                        <img ng-src=\"[[ getItemImageURL(transaction.item.id, transaction.count) ]]\"/>\n                        <span class=\"count\" ng-if=\"transaction.count > 1\">[[ formatNumber(transaction.count) ]]</span>\n                        <div class=\"members icon-members\" ng-if=\"transaction.item.members\"></div>\n                    </div>\n                    <div class=\"details\">\n                        <h2 class=\"title\" style=\"display: inline-block\">[[ transaction.item.name ]]</h2>\n                        <span class=\"subtitle\" style=\"display: inline-block\">~[[ transaction.total / transaction.count ]] each</span>\n<span class=\"subtitle\" style=\"display: block\">\n<span ng-if=\"transaction.bought\">Bought for</span>\n<span ng-if=\"transaction.sold\">Sold for</span>\n[[ transaction.total ]] gp\n</span>\n                    </div>\n                </div>\n            </li>\n        </ul>\n        <p ng-if=\"errorMessage\" class=\"empty-message error\">An error occurred while searching for items.</p>\n        <p ng-if=\"hasSearched && !showHistory && !errorMessage && !searchResults.length\" class=\"empty-message error\">\n            Your search returned no results.</p>\n    </div>\n    <div class=\"content push-top-double push-bottom-tiny\" ng-if=\"isTradeRestricted || !geBuySellEnabled\">\n        <p ng-if=\"isTradeRestricted\" class=\"empty-message error\">You cannot access the Grand Exchange from this\n            account.</p>\n        <p ng-if=\"!geBuySellEnabled && !isTradeRestricted\" class=\"empty-message error\">\n<span ng-if=\"!is2FactorEnabled\">\nYou need to <a href=\"https://secure.runescape.com/m=totp-authenticator/\" target=\"_blank\">add the RuneScape Authenticator to your account</a> before you can use the Grand Exchange to buy and sell items.\n</span>\n<span ng-if=\"!isComappTradingEnabled\">\nYou need to enable access by talking to the Grand Exchange Tutor in-game before you can use the Grand Exchange\nto buy and sell items.\n</span>\n        </p>\n    </div>\n    <footer class=\"footer tiny-footer gradient\">\n        Money Pouch:\n        <span class=\"right\">[[ playerGP | number ]] gp</span>\n    </footer>\n</section>");
            $templateCache.put("views/ge_slot.ws", "<section class=\"ge-slot\">\n    <header class=\"header\">\n        <a class=\"back\" ng-click=\"goRight(\'/grand-exchange\')\"><i class=\"icon-back\"></i></a>\n        <a scrolls-to-top>Grand Exchange</a>\n        <a style=\"float: right; margin-right: 15px;\" ng-click=\"$root.toggleFavorite(slot.offerItem)\" ng-if=\"slot.offerItem\">\n            <i ng-class=\"$root.checkFavorite(slot.offerItem) ? \'icon-minus\' : \'icon-plus\'\"></i></a>\n    </header>\n    <div class=\"content push-top-single push-bottom-tiny\">\n        <div class=\"generic-detail slot\" ng-if=\"slot && !isTradeRestricted\"\n             ng-class=\"{ \'buying\': slot.isBuying, \'selling\': slot.isSelling, \'complete\': slot.isComplete, \'aborted\': slot.isAborted }\">\n            <img ng-src=\"[[ slot.offerItem.imageUrl ]]\" class=\"icon\"/>\n            <div class=\"details double\">\n                <h2 class=\"title\">[[ slot.offerItem.name ]]</h2>\n                <span class=\"subtitle\" ng-if=\"slot.isBuying\">Buying</span>\n                <span class=\"subtitle\" ng-if=\"slot.isSelling\">Selling</span>\n                <a class=\"goto-stockmarket\" href=\"#!/stockmarket/item/[[ slot.offerItem.id ]]\">\n                    <i class=\"icon-stockmarket\"></i></a>\n            </div>\n            <div class=\"wrap\">\n                <p class=\"description\">[[ slot.offerItem.description ]]</p>\n            </div>\n            <div class=\"status\" ng-if=\"geBuySellEnabled\">\n                <a class=\"item-thumb left\" ng-repeat=\"collectSlot in slot.collectInv\"\n                   ng-click=\"collectFromCollectionSlot(collectSlot.invIndex)\">\n                    <img ng-src=\"[[ getItemImageURL(collectSlot.id, collectSlot.count) ]]\">\n                    <span class=\"count\" ng-if=\"collectSlot.count>1\">[[ formatNumber(collectSlot.count) ]]</span>\n                </a>\n                <div ng-if=\"!slot.isComplete && !slot.isAborted\">\n                    <p>In progress</p>\n                    <a ng-click=\"abort()\" class=\"abort clickable\"><i class=\"icon-discard\"></i></a>\n                </div>\n                <div ng-if=\"slot.isComplete\">\n                    <p>Complete. Please collect your items.</p>\n                    <a class=\"success\"><i class=\"icon-circletick\"></i></a>\n                </div>\n                <div ng-if=\"slot.isAborted\">\n                    <p>Aborted. Please collect your items.</p>\n                    <a class=\"abort\"><i class=\"icon-empty\"></i></a>\n                </div>\n                <div class=\"bar-wrap\">\n                    <div class=\"bar\" style=\"width: [[ (slot.offerCompletedCount / slot.offerCount) * 100 ]]%;\"></div>\n                </div>\n            </div>\n            <div class=\"status\" ng-if=\"!geBuySellEnabled\">\n                <p ng-if-=\"!is2FactorEnabled\">\n                    You need to <a href=\"https://secure.runescape.com/m=totp-authenticator/\" target=\"_blank\"\n                                   class=\"fade\">add the RuneScape Authenticator to your account</a> before you can\n                    collect items and abort transactions.\n                </p>\n                <p ng-if=\"!isComappTradingEnabled\">\n                    You need to enable access by talking to the Grand Exchange Tutor in-game before you can collect\n                    items and abort transactions.\n                </p>\n            </div>\n            <ul class=\"details-list\">\n                <li><span class=\"left\">Guide Price:</span><strong class=\"right\">[[ slot.offerItem.marketPrice | number\n                    ]] gp</strong></li>\n                <li><span class=\"left\">Offer Price:</span><strong class=\"right\">[[ slot.offerPrice | number ]]\n                    gp</strong></li>\n                <li><span class=\"left\">Quantity:</span><strong class=\"right\">[[ slot.offerCompletedCount | number ]]/[[\n                    slot.offerCount | number ]]</strong></li>\n                <li><span class=\"left\">Total GP:</span><strong class=\"right\">[[ slot.offerCompletedGold | number ]]\n                    gp</strong></li>\n            </ul>\n        </div>\n        <p class=\"empty-message error\" ng-if=\"isTradeRestricted\">You cannot access the Grand Exchange from this\n            account.</p>\n    </div>\n    <footer class=\"footer tiny-footer gradient\">\n        Money Pouch:\n        <span class=\"right\">[[ playerGP | number ]] gp</span>\n    </footer>\n</section>");
        });
        console.log("Script Loaded");
    };
})();
