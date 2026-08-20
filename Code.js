/**
 * Tic-Tac-Toe Arena | Final Boss Edition Backend Architecture
 * Powered by Google Apps Script CacheService for multi-device realtime room sync.
 */

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Tic-Tac-Toe Arena | Final Boss Multiplayer')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Generates a unique 4-digit room code and initializes a room state in CacheService.
 * @param {string} [initialStarter="X"] - Optional starting player symbol ('X' or 'O').
 * @returns {Object} Room initialization response with 4-digit code.
 */
function createGameRoom(initialStarter) {
  const cache = CacheService.getScriptCache();
  let code = "";
  let exists = true;

  // Generate unique 4-digit code
  while (exists) {
    code = Math.floor(1000 + Math.random() * 9000).toString();
    if (!cache.get("ROOM_" + code)) {
      exists = false;
    }
  }

  const starterSymbol = (initialStarter === "O") ? "O" : "X";

  const roomState = {
    code: code,
    status: "waiting", // 'waiting', 'flipping', 'playing', 'won', 'tie'
    p1: "X",           // Host is Player X
    p2: null,          // Guest is Player O
    board: ["", "", "", "", "", "", "", "", ""],
    starter: starterSymbol, // Explicitly set starter symbol ('X' or 'O')
    turn: starterSymbol,    // First move matches chosen starter
    scores: { X: 0, O: 0, Ties: 0 },
    winner: null,
    winningLine: [],
    coinResult: null,
    lastUpdate: Date.now()
  };

  cache.put("ROOM_" + code, JSON.stringify(roomState), 21600); // 6 hour TTL
  return { success: true, code: code, playerSymbol: "X", roomState: roomState };
}

/**
 * Explicitly sets the starting player symbol ('X' or 'O') for a room.
 * @param {string} code - 4-digit room code.
 * @param {string} starterSymbol - 'X' or 'O'.
 */
function setInitialStarter(code, starterSymbol) {
  const cache = CacheService.getScriptCache();
  const rawData = cache.get("ROOM_" + code);

  const symbol = (starterSymbol === "O") ? "O" : "X";

  if (!rawData) {
    return { success: true, starter: symbol };
  }

  let roomState = JSON.parse(rawData);
  roomState.starter = symbol;
  roomState.turn = symbol;
  roomState.lastUpdate = Date.now();

  cache.put("ROOM_" + code, JSON.stringify(roomState), 21600);
  return { success: true, roomState: roomState };
}

/**
 * Allows Player 2 to join a room via a 4-digit code and triggers the Coin Toss.
 * @param {string} code - 4-digit room code.
 * @returns {Object} Connection outcome and initial state.
 */
function joinGameRoom(code) {
  const cache = CacheService.getScriptCache();
  const rawData = cache.get("ROOM_" + code);

  if (!rawData) {
    return { success: false, message: "Room code not found or expired!" };
  }

  let roomState = JSON.parse(rawData);

  if (roomState.p2 && roomState.status !== "waiting") {
    return { success: false, message: "Room is already full!" };
  }

  // Coin Toss: Randomly assign who starts Round 1 ('X' or 'O')
  const coinResult = Math.random() < 0.5 ? "X" : "O";

  roomState.p2 = "O";
  roomState.status = "flipping";
  roomState.coinResult = coinResult;
  roomState.starter = coinResult;
  roomState.turn = coinResult; // Ensures starting mark matches coin result ('X' or 'O')
  roomState.lastUpdate = Date.now();

  cache.put("ROOM_" + code, JSON.stringify(roomState), 21600);

  return { success: true, code: code, playerSymbol: "O", roomState: roomState };
}

/**
 * Transitions room state from 'flipping' to 'playing' after coin toss completes.
 * @param {string} code - 4-digit room code.
 */
function startPlaying(code) {
  const cache = CacheService.getScriptCache();
  const rawData = cache.get("ROOM_" + code);

  if (!rawData) return { success: false };

  let roomState = JSON.parse(rawData);
  roomState.status = "playing";
  roomState.lastUpdate = Date.now();

  cache.put("ROOM_" + code, JSON.stringify(roomState), 21600);
  return { success: true, roomState: roomState };
}

/**
 * Fetches the current live state of a game room (Polling API).
 * @param {string} code - 4-digit room code.
 */
function getGameRoomState(code) {
  if (!code) return { success: false, message: "No code provided" };
  const cache = CacheService.getScriptCache();
  const rawData = cache.get("ROOM_" + code);
  
  if (!rawData) {
    return { success: false, message: "Room closed or expired." };
  }

  return { success: true, roomState: JSON.parse(rawData) };
}

/**
 * Validates and executes a player's move in online mode.
 * Places the player's exact active symbol ('O' if player O is moving, 'X' if player X is moving).
 */
function makeMultiplayerMove(code, playerSymbol, index) {
  const cache = CacheService.getScriptCache();
  const rawData = cache.get("ROOM_" + code);

  if (!rawData) return { success: false, message: "Room not found" };

  let roomState = JSON.parse(rawData);

  if (roomState.status !== "playing") return { success: false, message: "Game not active" };
  if (roomState.turn !== playerSymbol) return { success: false, message: "Not your turn!" };
  if (roomState.board[index] !== "") return { success: false, message: "Cell already taken!" };

  // Place player's active symbol on grid
  roomState.board[index] = playerSymbol;

  // Win Combos
  const WINNING_COMBOS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  let roundWon = false;
  let winningLine = [];

  for (let combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (roomState.board[a] && roomState.board[a] === roomState.board[b] && roomState.board[a] === roomState.board[c]) {
      roundWon = true;
      winningLine = combo;
      break;
    }
  }

  if (roundWon) {
    roomState.status = "won";
    roomState.winner = playerSymbol;
    roomState.winningLine = winningLine;
    roomState.scores[playerSymbol]++;
  } else if (!roomState.board.includes("")) {
    roomState.status = "tie";
    roomState.scores.Ties++;
  } else {
    // Switch turn to opposing player
    roomState.turn = playerSymbol === "X" ? "O" : "X";
  }

  roomState.lastUpdate = Date.now();
  cache.put("ROOM_" + code, JSON.stringify(roomState), 21600);

  return { success: true, roomState: roomState };
}

/**
 * Resets board for next round while ALTERNATING starting player symbol.
 */
function resetMultiplayerRound(code) {
  const cache = CacheService.getScriptCache();
  const rawData = cache.get("ROOM_" + code);

  if (!rawData) return { success: false };

  let roomState = JSON.parse(rawData);

  // Alternate starting player symbol for next round
  const nextStarter = roomState.starter === "X" ? "O" : "X";

  roomState.board = ["", "", "", "", "", "", "", "", ""];
  roomState.status = "playing";
  roomState.starter = nextStarter;
  roomState.turn = nextStarter;
  roomState.winner = null;
  roomState.winningLine = [];
  roomState.lastUpdate = Date.now();

  cache.put("ROOM_" + code, JSON.stringify(roomState), 21600);
  return { success: true, roomState: roomState };
}

/**
 * Resets score & board state.
 */
function resetMultiplayerScores(code) {
  const cache = CacheService.getScriptCache();
  const rawData = cache.get("ROOM_" + code);

  if (!rawData) return { success: false };

  let roomState = JSON.parse(rawData);

  const starter = roomState.starter || "X";

  roomState.scores = { X: 0, O: 0, Ties: 0 };
  roomState.board = ["", "", "", "", "", "", "", "", ""];
  roomState.status = "playing";
  roomState.turn = starter;
  roomState.winner = null;
  roomState.winningLine = [];
  roomState.lastUpdate = Date.now();

  cache.put("ROOM_" + code, JSON.stringify(roomState), 21600);
  return { success: true, roomState: roomState };
}