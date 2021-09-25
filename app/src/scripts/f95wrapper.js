// Copyright (c) 2021 MillenniumEarl
// 
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

"use strict";

// Public modules from npm
const F95API = require("@millenniumearl/f95api");
const { CaptchaHarvest } = require("@millenniumearl/recaptcha-harvester");

// Local modules
const GameInfoExtended = require("./classes/game-info-extended");

// Set F95API logger level
F95API.loggerLevel = "warn";

class F95Wrapper {
    userData = null;

    isLogged() {
        return F95API.isLogged();
    };

    login(username, password) { 
        return F95API.login(username, password, retrieveCaptchaToken); 
    }

    async getUserData() {
        if (!this.userData) {
            this.userData = new F95API.UserProfile();
            await this.userData.fetch(true);
        }
        return this.userData;
    }

    getGameData(name, searchMod) {
        const query = new F95API.HandiworkSearchQuery();
        query.keywords = name;
        query.category = searchMod ? "mods" : "games";
        return F95API.searchHandiwork(query);
    }

    getGameDataFromURL(url) {
        return F95API.getHandiworkFromURL(url);
    }

    async checkGameUpdates(data) {
        // Create a new object from the data
        const gameinfo = Object.assign(new GameInfoExtended(), data);

        // This method require GameInfo but GameInfoExtended is extended from GameInfo
        const onlineData = await F95API.getHandiworkFromURL(gameinfo.url);
        return onlineData.version !== gameinfo.version;
    }
}

async function retrieveCaptchaToken() {
    // Local variables
    const website = "https://f95zone.to";
    const sitekey = "6LcwQ5kUAAAAAAI-_CXQtlnhdMjmFDt-MruZ2gov";

    // Start the harvester
    const harvester = new CaptchaHarvest();
    await harvester.start();

    // Fetch token
    try {
        const token = await harvester.getCaptchaToken(website, sitekey);
        return token.token;
    } catch (e) {
        console.log(`Error while retrieving CAPTCHA token:\n${e}`);
    } finally {
        // Stop harvester
        harvester.stop();
    }
}

module.exports = F95Wrapper;