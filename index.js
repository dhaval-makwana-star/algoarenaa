const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

// ─── DSA Question Bank ─────────────────────────────────────────────────────
const DSA_QUESTIONS = [
  {
    question: "What is the time complexity of Binary Search?",
    correctAnswer: "O(log n)",
    complexity: "Easy",
    timeLimit: 30,
  },
  {
    question: "Which data structure uses LIFO order?",
    correctAnswer: "Stack",
    complexity: "Easy",
    timeLimit: 30,
  },
  {
    question: "What is the worst-case time complexity of QuickSort?",
    correctAnswer: "O(n^2)",
    complexity: "Medium",
    timeLimit: 45,
  },
  {
    question: "What data structure is used in BFS traversal?",
    correctAnswer: "Queue",
    complexity: "Easy",
    timeLimit: 30,
  },
  {
    question: "What is the space complexity of Merge Sort?",
    correctAnswer: "O(n)",
    complexity: "Medium",
    timeLimit: 45,
  },
  {
    question: "In a min-heap, where is the smallest element?",
    correctAnswer: "Root",
    complexity: "Easy",
    timeLimit: 30,
  },
  {
    question: "What traversal gives sorted output from a BST?",
    correctAnswer: "Inorder",
    complexity: "Medium",
    timeLimit: 45,
  },
  {
    question: "What is the time complexity of inserting into a Hash Table on average?",
    correctAnswer: "O(1)",
    complexity: "Medium",
    timeLimit: 45,
  },
  {
    question: "Which algorithm finds shortest path in a weighted graph?",
    correctAnswer: "Dijkstra",
    complexity: "Hard",
    timeLimit: 60,
  },
  {
    question: "What is the time complexity of building a heap from an array?",
    correctAnswer: "O(n)",
    complexity: "Hard",
    timeLimit: 60,
  },
  {
    question: "How many edges does a complete graph with N vertices have?",
    correctAnswer: "N*(N-1)/2",
    complexity: "Hard",
    timeLimit: 60,
  },
  {
    question: "What data structure does DFS use internally (recursion aside)?",
    correctAnswer: "Stack",
    complexity: "Medium",
    timeLimit: 45,
  },
];

// ─── Room State ─────────────────────────────────────────────────────────────
// rooms[roomName] = { players: [{ socketId, uid }], question, started, timerId }
let rooms = {};

// uid map: socketId → uid
let uidMap = {};

function getRandomQuestion() {
  return DSA_QUESTIONS[Math.floor(Math.random() * DSA_QUESTIONS.length)];
}

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  // ─── Set UID ──────────────────────────────────────────────────────────────
  socket.on("setUid", (uid) => {
    uidMap[socket.id] = uid;
    console.log(`🔑 UID set: ${socket.id} → ${uid}`);
  });

  // ─── Join Named Room ──────────────────────────────────────────────────────
  socket.on("joinRoom", (roomName) => {
    // Create room if doesn't exist
    if (!rooms[roomName]) {
      rooms[roomName] = {
        players: [],
        question: null,
        started: false,
        finished: false,
        timerId: null,
      };
    }

    const room = rooms[roomName];

    // Don't allow joining finished or full rooms (max 2 for 1v1)
    if (room.finished) {
      socket.emit("errorMessage", "This room has already finished. Please wait.");
      return;
    }

    // Prevent duplicate join
    const alreadyIn = room.players.find((p) => p.socketId === socket.id);
    if (alreadyIn) {
      socket.emit("joinedRoom", { roomId: roomName, playerCount: room.players.length });
      return;
    }

    socket.join(roomName);
    room.players.push({ socketId: socket.id, uid: uidMap[socket.id] || socket.id });

    const count = room.players.length;
    console.log(`🚪 ${socket.id} joined room "${roomName}" — ${count} player(s)`);

    // Notify everyone in room
    socket.emit("joinedRoom", { roomId: roomName, playerCount: count });
    io.to(roomName).emit("playerCountUpdate", {
      count,
      message: count >= 2 ? "Battle starting!" : "Waiting for opponent...",
    });

    // Start game when 2 players join
    if (count >= 2 && !room.started) {
      room.started = true;

      const q = getRandomQuestion();
      room.question = q;

      console.log(`🎮 Game starting in room "${roomName}" with question: ${q.question}`);

      // 3-second countdown then send question
      let countdown = 3;
      const cdInterval = setInterval(() => {
        io.to(roomName).emit("countdown", { count: countdown });
        countdown--;
        if (countdown < 0) {
          clearInterval(cdInterval);

          io.to(roomName).emit("gameStarted", {
            question: q.question,
            complexity: q.complexity,
            timeLimit: q.timeLimit,
          });

          // Auto-finish timer
          room.timerId = setTimeout(() => {
            if (!room.finished) {
              room.finished = true;
              io.to(roomName).emit("gameFinished", {
                winnerId: null,
                message: "⏰ Time's up! No winner this round.",
                coins: 0,
              });
            }
          }, q.timeLimit * 1000);
        }
      }, 1000);
    }
  });

  // ─── Submit Answer ────────────────────────────────────────────────────────
  socket.on("submitAnswer", ({ roomId, answer }) => {
    const room = rooms[roomId];
    if (!room || room.finished || !room.question) return;

    const correct = room.question.correctAnswer.toLowerCase().trim();
    const submitted = (answer || "").toLowerCase().trim();

    if (submitted === correct) {
      room.finished = true;
      if (room.timerId) clearTimeout(room.timerId);

      const winnerUid = uidMap[socket.id] || socket.id;

      console.log(`🏆 Winner in room "${roomId}": ${winnerUid}`);

      io.to(roomId).emit("gameFinished", {
        winnerId: winnerUid,
        winnerSocketId: socket.id,
        message: `🏆 Winner found! +50 coins awarded!`,
        coins: 50,
      });
    } else {
      socket.emit("wrongAnswer", { message: "❌ Wrong answer! Try again." });
    }
  });

  // ─── Create Room (legacy) ─────────────────────────────────────────────────
  socket.on("createRoom", () => {
    const roomId = Math.random().toString(36).substring(2, 8);
    rooms[roomId] = { players: [], question: null, started: false, finished: false, timerId: null };
    socket.join(roomId);
    rooms[roomId].players.push({ socketId: socket.id, uid: uidMap[socket.id] || socket.id });
    socket.emit("roomCreated", roomId);
  });

  // ─── Disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    delete uidMap[socket.id];

    // Remove from all rooms
    for (const roomName in rooms) {
      const room = rooms[roomName];
      room.players = room.players.filter((p) => p.socketId !== socket.id);

      if (room.players.length === 0) {
        if (room.timerId) clearTimeout(room.timerId);
        delete rooms[roomName];
        console.log(`🗑️ Room "${roomName}" deleted (empty)`);
      } else {
        io.to(roomName).emit("playerCountUpdate", {
          count: room.players.length,
          message: "Opponent disconnected. Waiting...",
        });
      }
    }
  });
});

server.listen(5000, () => {
  console.log("🚀 AlgoArena server running on port 5000");
});