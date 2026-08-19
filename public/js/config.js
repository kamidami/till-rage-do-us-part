// =============================================================
// TILL RAGE DO US PART v2.4 — SUNFLOWERS FOR TWO
// Easy-to-edit values live here.
// =============================================================
window.GAME_CONFIG = {
  title: "Till Rage Do Us Part",
  build: "v2.4 Sunflowers for Two",

  playerSpeed: 4.15,
  playerRadius: 0.46,
  normalAcceleration: 8.8,
  normalStop: 10.5,
  rugAcceleration: 4.0,
  rugStop: 2.15,

  grabDistance: 2.1,
  tetherDistance: 3.2,
  sofaFollowSpeed: 8.0,
  sofaRotateSpeed: 7.2,
  sofaSlideFriction: 3.6,
  sofaRugSlideFriction: 0.72,
  sofaMaxSlideSpeed: 3.8,

  patienceDrainWhilePullingApart: 6.2,
  patienceDrainOnWallFight: 3.8,
  patienceDrainCat: 3.5,
  patienceDrainVase: 5.0,
  patienceRecovery: 1.0,

  winHoldSeconds: 1.35,
  goalCenter: { x: 10.8, z: 0.0 },
  goalHalfSize: { x: 2.15, z: 2.1 },
  rug: { minX: -14.8, maxX: -5.0, minZ: -4.4, maxZ: 4.4 },
  doorwayPassedX: 1.35,

  pettyDoor: {
    hingeX: 0.0,
    hingeZ: -2.47,
    length: 1.95,
    thickness: 0.22,
    speed: 1.05,
    swing: 1.08
  },

  colors: {
    playerOne: 0x74c9ff,
    playerTwo: 0xff8eac,
    sofa: 0x8f71ff,
    floor: 0x35213c,
    wall: 0xe9cfdc,
    goal: 0xff6f91,
    rug: 0x5c2f65
  },

  story: [
    {
      kicker: "CHAPTER ONE · OUR NEW HOME",
      title: "The apartment is finally yours.",
      speaker: "Narrator",
      text: "Rain taps softly outside while moving boxes fill the entryway. The place is empty, warm, and just a little suspicious."
    },
    {
      kicker: "THE FRONT DOOR CLICKS SHUT",
      title: "Someone is already on the sofa.",
      speaker: "Dr. Fluffles",
      text: "Good evening. I am your landlord, therapist, and entirely self-appointed relationship auditor. Please ignore the clipboard. I drew it myself."
    },
    {
      kicker: "FIRST SMALL DOMESTIC CRISIS",
      title: "Make this place feel like home.",
      speaker: "Dr. Fluffles",
      text: "Start with the sofa, then arrange the rest of the living room together. Heavy furniture needs both of you. Fragile decor rewards gentle hands and punishes comedy."
    }
  ],

  quizQuestions: [
    {
      prompt: "After a truly awful day, what helps YOU most?",
      options: ["Quiet hug", "Food immediately", "Let me rant", "Give me space"]
    },
    {
      prompt: "Your ideal spontaneous date is…",
      options: ["Cozy night at home", "Fancy dinner", "Random adventure", "Long drive + music"]
    },
    {
      prompt: "After a silly argument, what do YOU want first?",
      options: ["A real apology", "Affection", "A peace-offering snack", "Time to cool down"]
    },
    {
      prompt: "When plans completely collapse, your instinct is…",
      options: ["Improvise", "Make a new plan", "Laugh at the disaster", "Blame Google Maps"]
    },
    {
      prompt: "When you are both hungry and nobody can choose food, YOU usually…",
      options: ["Pick something fast", "Ask them to choose", "Open every delivery app", "Become dramatically indecisive"]
    },
    {
      prompt: "What kind of affection softens YOU fastest?",
      options: ["A long hug", "Holding hands", "A sweet message", "Making me laugh"]
    },
    {
      prompt: "Your perfect lazy weekend morning is…",
      options: ["Sleep forever", "Breakfast together", "Movie in bed", "Go outside eventually"]
    },
    {
      prompt: "When your partner looks stressed, your first instinct is…",
      options: ["Ask what happened", "Give a hug", "Bring food or tea", "Give them quiet space"]
    },
    {
      prompt: "What makes a home feel most like YOUR home?",
      options: ["Warm lighting", "Good food", "Little personal things", "The right person there"]
    },
    {
      prompt: "If you could pause one ordinary moment together, which would you keep?",
      options: ["Tea and talking", "Laughing over nothing", "A quiet drive", "Falling asleep together"]
    },
    {
      prompt: "What tiny gesture do you notice more than people think?",
      options: ["Checking in on me", "Remembering details", "Sharing food", "Physical affection"]
    },
    {
      prompt: "After a chaotic day together, your ideal ending is…",
      options: ["Talk about it", "Cuddle in silence", "Watch something silly", "Sleep immediately"]
    }
  ],

  fluffles: {
    intro: [
      "One sofa. Two adults. Several unresolved directional opinions.",
      "For legal reasons, this is called an inspection. For me, it is entertainment.",
      "Please proceed naturally. I have already waived the emotional warranty."
    ],
    rug: [
      "The rug is slippery because stability would undermine the research.",
      "Traction has left the relationship. Temporarily, I assume.",
      "Beautiful footwork. Very little furniture progress, but beautiful footwork."
    ],
    pulling: [
      "You are both helping. In opposite directions.",
      "Fascinating. Upholstery-based conflict resolution.",
      "I have updated your file. The file is now just screaming."
    ],
    wall: [
      "The wall has communicated its boundary more clearly than either of you.",
      "The doorway remains in the same location. I checked.",
      "Repeatedly hitting the wall is technically consistency."
    ],
    door: [
      "The door is not angry. It is simply petty and mechanically committed.",
      "Timing, communication, and not blaming the architecture may help.",
      "The door has no feelings. This gives it a tactical advantage."
    ],
    cat: [
      "The cat has no objective. This makes it the most dangerous participant.",
      "Please do not negotiate with the cat. It has legal representation.",
      "The cat has selected chaos. Respect its process."
    ],
    vase: [
      "That vase was emotionally irreplaceable and financially suspicious.",
      "Wonderful. Property damage. A classic communication milestone.",
      "I will add decorative casualties to the session notes."
    ],
    lowPatience: [
      "One of you has entered the dangerous 'I'm fine' phase.",
      "Please remember: the furniture did not choose this relationship.",
      "Patience is dropping. My invoice, however, is rising."
    ],
    almostThere: [
      "Careful. Success this close can cause dangerous optimism.",
      "Against all available evidence, this may actually work.",
      "Do not celebrate yet. The sofa can smell confidence."
    ],
    quizIntro: [
      "Two physical trials survived. Unfortunately, I now require emotional data.",
      "Next trial: answer privately. Peeking is cheating, and cheating is statistically very funny.",
      "You moved furniture and cooked together. Now let us find out whether you have ever actually listened."
    ],
    win: [
      "Inspection complete. I remain professionally concerned but reluctantly impressed.",
      "You may keep the apartment. The cat was never mine to give away.",
      "Congratulations. Your relationship has passed a test designed by an unlicensed teddy bear."
    ]
  }
};
