/* Global variables */
let lastGameCardID = 0;

//#region Events
document.addEventListener("DOMContentLoaded", function () {
  // This function runs when the DOM is ready, i.e. when the document has been parsed
  window.API.log.info("DOM loaded, initializing elements");

  // Initialize the navigator-tab
  const tabNavigator = document.getElementById("navigator-tab");
  M.Tabs.init(tabNavigator, {});

  // Initialize the floating button
  const elems = document.querySelectorAll(".fixed-action-btn");
  M.FloatingActionButton.init(elems, {
    direction: "left",
    hoverEnabled: false,
  });

  // Select the defualt page
  openPage("games-tab");

  // Load the cached games
  loadCachedGames().then(function () {
    // Login after loading games to
    // allow the games to search for updates
    login();
  });
});

document.querySelector("#search-game-name").addEventListener("input", () => {
  // Obtain the text
  const searchText = document
    .getElementById("search-game-name")
    .value.toUpperCase();

  // Obtain all the available GameCard
  const gameCards = document.querySelectorAll("game-card");

  // Hide the column which the game-card belong
  // if it's games with a title that not match the search query
  for (const gameCard of gameCards) {
    if (!gameCard.info.name.toUpperCase().startsWith(searchText)) {
      gameCard.parentNode.style.display = "none";
    } else {
      gameCard.parentNode.style.display = "block";
    }
  }
});

document.querySelector("#user-info").addEventListener("login", login);

document
  .querySelector("#add-remote-game-btn")
  .addEventListener("click", async function () {
    const openDialogOptions = {
      title: "Select game directory",
      properties: ["openDirectory"],
    };

    const data = await window.API.invoke("open-dialog", openDialogOptions);

    // No folder selected
    if (data.filePaths.length === 0) return;

    // Ask the URL of the game
    const promptDialogOptions = {
      title: "Insert the game URL on F95Zone",
      label: "URL:",
      value: "https://f95zone.to/threads/gamename/",
      inputAttrs: {
        type: "url",
      },
      type: "input",
    };

    const url = await window.API.invoke("prompt-dialog", promptDialogOptions);
    if (!url) return;

    sendToastToUser("info", "Adding game from URL...");

    // Add game to list
    const cardPromise = await getGameFromPath(data.filePaths.pop());
    if (!cardPromise.cardElement) return;

    const info = await window.F95.getGameDataFromURL(url);
    cardPromise.cardElement.info = info;
  });

document.querySelector("#add-local-game-btn").addEventListener("click", () => {
  const openDialogOptions = {
    title: "Select game directory",
    properties: ["openDirectory", "multiSelections"],
  };

  window.API.invoke("open-dialog", openDialogOptions).then((data) => {
    // No folder selected
    if (data.filePaths.length === 0) return;

    // Obtain the data
    sendToastToUser("info", "Adding game from path...");
    getGameFromPaths(data.filePaths);
  });
});
//#endregion Events

//#region Private methods
/**
 * @private
 * Select the tab with the specified ID in DOM.
 * @param {String} pageID
 */
function openPage(pageID) {
  // Local variables
  let i;

  // Hide all elements with class="tabcontent" by default
  const tabcontent = document.getElementsByClassName("tabcontent");
  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }

  // Show the specific tab content
  document.getElementById(pageID).style.display = "block";
}

/**
 * @private
 * Create an empty *game-card* and add it in the DOM.
 * @returns {HTMLElement} Created game-card element
 */
function addGameCard() {
  // Create a GameCard. The HTML is loaded when the custom element is connected to DOM, so:
  // 1 - First we create the element
  // 2 - When connect the element to DOM
  // 3 - Lastly. we can change the "gamedata" property
  const gameCard = document.createElement("game-card");
  addEventListenerToGameCard(gameCard);
  gameCard.setAttribute("id", "game-card-" + lastGameCardID);
  lastGameCardID += 1;

  // Create a simil-table layout wit materialize-css
  // "s6" means that the element occupies 6 of 12 columns with small screens
  // "m5" means that the element occupies 5 of 12 columns with medium screens
  // "l4" means that the element occupies 4 of 12 columns with large screens
  // "xl3" means that the element occupies 3 of 12 columns with very large screens
  // The 12 columns are the base layout provided by materialize-css
  const column = document.createElement("div");
  column.setAttribute("class", "col s6 m5 l4 xl3");
  column.appendChild(gameCard);

  // Connect the new column in DOM
  const row = document.getElementById("game-cards-container");
  row.appendChild(column);

  return gameCard;
}

/**
 * @private
 * Add the event listeners (play/update/delete) to a specific GameCard.
 * @param {GameCard} gamecard Object to add the listeners to
 */
function addEventListenerToGameCard(gamecard) {
  gamecard.addEventListener("play", function (e) {
    if (e.target) {
      const launcherPath = e.detail.launcher;
      window.API.send("exec", launcherPath);
    }
  });

  gamecard.addEventListener("update", function (e) {
    if (e.target) {
      guidedGameUpdate(gamecard, e.detail.gameDir, e.detail.url);

      // Download and install (first hosting platoform in list)
      // !!! Against the guidelines: DON'T DO IT !!!
      // let downloadInfo = e.detail["downloadInfo"];
      // for (let di of downloadInfo) {
      //   if (di.supportedOS.includes(window.API.platform)) {
      //     di.download(gameDir);
      //     break;
      //   }
      // }
    }
  });

  gamecard.addEventListener("delete", function (e) {
    if (!e.target) return;

    // Ask the confirmation
    const dialogOptions = {
      type: "question",
      buttons: ["Remove only", "Delete also game files", "Cancel"],
      defaultId: 2, // Cancel
      title: "Confirm deletion",
      message: "Do you really want to eliminate the game?",
      checkboxLabel: "Keep saves (if possible)",
      checkboxChecked: true,
    };

    window.API.invoke("message-dialog", dialogOptions).then(function (data) {
      if (!data) return;

      // Cancel button
      if (data.response === 2) return;
      else {
        // Copy saves
        if (data.checkboxChecked) {
          // TODO...
        }

        // Delete also game files
        if (data.response === 1) {
          const gameDir = e.detail.gameDir;
          window.IO.deleteFolder(gameDir);
        }

        // Remove the game data
        gamecard.deleteGameData();

        // Remove the column div containing the card
        const id = gamecard.getAttribute("id");
        document.querySelector("#" + id).parentNode.remove();
      }
    });
  });
}

/**
 * @private
 * Guide the user in the game update.
 * @param {HTMLElement} gamecard GameCard of the game to update
 * @param {String} gamedir Directory where the game is installed
 * @param {String} gameurl  URL of the game
 */
function guidedGameUpdate(gamecard, gamedir, gameurl) {
  window.API.log.info("Update of " + gamecard.info.name + ", step 1");
  const optionsStepOne = {
    type: "info",
    buttons: ["Open F95 page", "Cancel"],
    defaultId: 1, // Cancel
    title: "Update game: Step 1",
    message:
      "Click 'Open F95 Page' to download the game.\nInstall/extract it in the directory that will open when this window is closed.\nFollow the installation instructions on the official page.\nYou may need to delete the previous version and/or any saved games",
    detail: "Changelog:\n" + gamecard.changelog,
  };

  window.API.invoke("message-dialog", optionsStepOne).then(function (data) {
    if (!data) return;
    if (data.response !== 0) return;

    // Open URL in default browser
    window.API.send("exec", gameurl);

    // Open the game directory
    window.API.send("exec", gamedir);

    // Mark the update as completed
    const optionsStepTwo = {
      type: "info",
      buttons: ["Update completed", "Cancel"],
      defaultId: 1, // Cancel
      title: "Update game: Step 2",
      message: "Click 'Update completed' to mark the game as updated.",
      detail:
        "Clicking on 'Update completed', will rename the directory, make sure it is not used by other processes!",
    };
    window.API.log.info("Update of " + gamecard.info.name + ", step 2");

    window.API.invoke("message-dialog", optionsStepTwo).then(async function (
      data
    ) {
      if (!data) return;
      if (data.response !== 0) return;

      // Finalize the update
      const result = await gamecard.finalizeUpdate();

      if (!result) {
        sendToastToUser(
          "error",
          "Cannot finalize the update, please check if another directory of the game exists."
        );
        window.API.log.error("Cannot finalize the update, please check if another directory of the game exists");
      }
    });
  });
}

/**
 * @private
 * Remove all the special characters from a string.
 * It remove all the characters (spaced excluded) that have the same "value" in upper and lower case.
 * @param {String} str String to parse
 * @param {String[]} allowedChars List of allowed special chars
 * @returns {String} Parsed string
 */
function removeSpecials(str, allowedChars) {
  const lower = str.toLowerCase();
  const upper = str.toUpperCase();

  let res = "";
  for (let i = 0; i < lower.length; ++i) {
    if (
      lower[i] !== upper[i] ||
      lower[i].trim() === "" ||
      allowedChars.includes(lower[i])
    )
      res += str[i];
  }
  return res;
}

/**
 * @private
 * Load the data of the cached game and display them in the main window.
 */
async function loadCachedGames() {
  window.API.log.info("Load cached games...");

  // Get all the .json files in the game dir and create a <game-card> for each of them
  const gamesDir = await window.API.invoke("games-data-dir");
  const files = await window.IO.filter("*.json", gamesDir);

  // Load data in game-cards
  const promisesList = [];
  for (const filename of files) {
    const card = addGameCard();
    const gameJSONPath = window.API.join(gamesDir, filename);

    const promise = card.loadGameData(gameJSONPath);
    promisesList.push(promise);
  }

  // Write end log
  Promise.all(promisesList).then(function () {
    window.API.log.info("Cached games loaded");
  });
}

/**
 * @private
 * Check the version of the listed games
 * in the game-card components in DOM.
 */
async function checkVersionCachedGames() {
  window.API.log.info("Checking for game updates...");
  sendToastToUser("info", "Checking for game updates...");

  // Get all the gamecards in DOM
  const cardGames = document.querySelectorAll("game-card");
  for (const card of cardGames) {
    // Get version
    const update = await window.F95.checkGameUpdates(card.info);

    // Trigger the component
    if (update) {
      const promise = window.F95.getGameDataFromURL(card.info.f95url);
      card.notificateUpdateOnPromise(promise);
    }
  }
}

/**
 * @private
 * It checks if a network connection is available
 * and notifies the main process to perform
 * the login procedure.
 */
function login() {
  // Check network connection
  if (!window.API.isOnline) {
    sendToastToUser("warning", "No network connection");
    window.API.log.warn("No network connection, cannot login");
    return;
  }

  // Show the spinner in the avatar component
  document.getElementById("user-info").showSpinner();

  // Request user input
  window.API.log.info("Send API to main process for auth request");
  window.API.send("login-required");
}

/**
 * @async
 * @private
 * Given a directory listing, it gets information about the games contained in them.
 * @param {String[]} paths Path of the directories containg games
 */
async function getGameFromPaths(paths) {
  // Allow max 3 searched at the time
  let promiseList = [];
  const MAX_PROMISE_AT_TIME = 3;

  // Parse the game dir name(s)
  for (const path of paths) {
    const promise = getGameFromPath(path)
      .then(function (result) {
        if (result.result) return; 
        // Send the error message to the user if the game is not found
        sendMessageToUserWrapper(
          "warning",
          "Game not detected",
          result.message,
          result.details
        );
        window.API.log.warn("Cannot detect game: " + result.message + ", " + result.details);
      })
      .catch(function (error) {
        // Send error message
        sendMessageToUserWrapper(
          "error",
          "Unexpected error",
          "Cannot retrieve game data (" +
            path +
            "), unexpected error: " +
            error,
          ""
        );
        window.API.log.error(
          "Unexpected error while retrieving game data from path: " +
            path +
            ". " +
            error
        );
      });

    promiseList.push(promise);
    if (promiseList.length === MAX_PROMISE_AT_TIME) {
      window.API.log.silly(
        "Waiting for promises for game data from multiple paths to finish..."
      );
      await Promise.all(promiseList);
      promiseList = [];
    }
  }
}

/**
 * @async
 * @private
 * Given a directory path, parse the dirname, get the
 * game (if exists) info and add a *game-card* in the DOM.
 * @param {String} path Game directory path
 * @returns {Promise<Object>} Dictionary containing the result of the operation: {result, message}
 */
async function getGameFromPath(path) {
  // After the splitting, the last name is the directory name
  const unparsedName = path.split("\\").pop();

  // Check if it is a mod
  const MOD_TAG = "[MOD]";
  const includeMods = unparsedName.toUpperCase().includes(MOD_TAG)
    ? true
    : false;

  // Find game version
  const version = getGameVersionFromName(unparsedName);

  // Get only the game title
  name = cleanGameName(unparsedName);

  // Search and add the game
  const promiseResult = await window.F95.getGameData(name, includeMods);

  // No game found
  if (promiseResult.length === 0) {
    return {
      result: false,
      message: "Cannot retrieve information for " + unparsedName,
      detail: "Check the network connection, check if the game exists or verify that the game directory name is in the format: game name [v. Game Version] [MOD]\n(Case insensitive, use [MOD] only if necessary)",
      cardElement: null,
    };
  } else if (promiseResult.length !== 1) {
    return {
      result: false,
      message: "Cannot retrieve information for " + unparsedName,
      detail:
        "Multiple occurrences of '" +
        unparsedName +
        "' detected. Add the game via URL",
      cardElement: null,
    };
  }

  // Add the game
  const copy = Object.assign({}, promiseResult[0]); // Copy reference to object
  const firstGame = promiseResult[0];
  const card = addGameCard();
  const onlineVersion = firstGame.version;

  // Update local data
  firstGame.gameDir = path;
  firstGame.version = version;
  card.info = firstGame;
  card.saveGameData();
  if (onlineVersion.toUpperCase() !== version.toUpperCase()) {
    card.notificateUpdate(copy);
  }

  return {
    result: true,
    message: name + " added correctly",
    details: "",
    cardElement: card,
  };
}

/**
 * @private
 * Given a game name, remove all the special characters and various tag (*[tag]*).
 * @param {String} name
 * @returns {String}
 */
function cleanGameName(name) {
  // Remove special chars except for version and specific tag chars
  name = removeSpecials(name, [
    "-",
    "[",
    "]",
    ".",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
  ]);

  // Remove mod tag and version
  const rx = /\[(.*?)\]/g;
  name = name.replaceAll(rx, "").trim();

  return name;
}

/**
 * @private
 * Given a non-parsed game name, extract the version if a tag **[v.version]** is specified.
 * @example [v.1.2.3.4], [V.somevalue]
 * @param {String} name
 */
function getGameVersionFromName(name) {
  // Local variables
  let version = "Unknown";
  const PREFIX_VERSION = "[V."; // i.e. namegame [v.1.2.3.4]

  // Search the version tag, if any
  if (name.toUpperCase().includes(PREFIX_VERSION)) {
    const startIndex =
      name.toUpperCase().indexOf(PREFIX_VERSION) + PREFIX_VERSION.length;
    const endIndex = name.indexOf("]", startIndex);
    version = name.substr(startIndex, endIndex - startIndex);
  }

  return version;
}

/**
 * @private
 * Wrapper to show a plain message box to the user.
 * @param {String} type Type of message (*error/warning/...*)
 * @param {String} title Title of the window
 * @param {String} message Message to the user
 * @param {String} detail Submessage to the user
 */
function sendMessageToUserWrapper(type, title, message, detail) {
  // Send the error message to the user if the game is not found
  const warningDialogOptions = {
    type: type,
    buttons: ["OK"],
    defaultId: 0,
    title: title,
    message: message,
    detail: detail,
  };

  // Send a message to the user
  window.API.invoke("message-dialog", warningDialogOptions);
}

/**
 * Show a toast in the top-right of the screen.
 * @param {String} type Type of message (*error/warning/...*)
 * @param {String} message Message to the user
 */
function sendToastToUser(type, message) {
  // Select various data based on the type of message
  let icon = "info";
  let htmlColor = "blue";
  let timer = 3000;
  if (type === "error") {
    icon = "error_outline";
    htmlColor = "red";
    timer = 25000;
  } else if (type === "warning") {
    icon = "warning";
    htmlColor = "orange";
    timer = 15000;
  }

  const htmlToast =
    "<i class='material-icons' style='padding-right: 10px'>" +
    icon +
    "</i><span>" +
    message +
    "</span>";
  M.toast({
    html: htmlToast,
    displayLength: 5000,
    classes: htmlColor,
  });
}

/**
 * @private
 * Obtain data of the logged user and show them in the custom element "user-info".
 */
async function getUserDataFromF95() {
  window.API.log.info("Retrieving user info from F95");
  // Retrieve user data
  const userdata = await window.F95.getUserData();

  // Check user data
  if (userdata === null || !userdata) {
    // Send error message
    sendToastToUser("error", "Cannot retrieve user data");
    window.API.log.error("Something wrong while retrieving user info from F95");
  }

  // Update component
  document.getElementById("user-info").userdata = userdata;
}
//#endregion Private methods

//#region IPC receive
// Called when the window is being closed
window.API.receive("window-closing", function () {
  // Save data game
  const cardGames = document.querySelectorAll("game-card");
  const promiseList = [];
  for (const card of cardGames) {
    const promise = card.saveGameData();
    promiseList.push(promise);
  }

  Promise.all(promiseList).then(function () {
    // Close F95 browser
    window.F95.logout();

    // Tell the main process to close this BrowserWindow
    window.API.send("main-window-closing");
  });
});

// Called when the result of the authentication are ready
window.API.receive("auth-result", (args) => {
  // Parse args
  const result = args[0];
  const username = args[1];
  const password = args[2];

  window.API.log.info("Authentication result: " + result);
  if (result !== "AUTHENTICATED") {
    // Hide "new game" button
    document.querySelector("#fab-add-game-btn").style.display = "none";

    // Hide spinner
    document.getElementById("user-info").hideSpinner();
    return;
  }

  // Load data (session not shared between windows)
  window.F95.login(username, password)
    .then(function () {
      sendToastToUser("info", "Login successful!");

      // Load F95 base data
      window.F95.loadF95BaseData();

      // Load user data
      getUserDataFromF95();

      // Check games updates
      checkVersionCachedGames();

      // Show "new game" button
      document.querySelector("#fab-add-game-btn").style.display = "block";
    })
    .catch(function (error) {
      // Send error message
      sendToastToUser("error", "Cannot login: " + error);
      window.API.log.error("Cannot login: " + error);
    });
});
//#endregion IPC receive
