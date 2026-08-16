// =============================================================
// TILL RAGE DO US PART v0.8 — KITCHEN CLARITY + LEVEL SKIP BUILD
// Easy-to-edit values live here.
// =============================================================
window.GAME_CONFIG = {
  title: "Till Rage Do Us Part",
  build: "v1.0 Online Couple Multiplayer",

  playerSpeed: 4.45,
  playerRadius: 0.46,
  normalAcceleration: 13.0,
  normalStop: 15.0,
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
  goalCenter: { x: 7.25, z: 0.0 },
  goalHalfSize: { x: 1.95, z: 1.95 },
  rug: { minX: -8.8, maxX: -2.15, minZ: -3.3, maxZ: 3.3 },
  doorwayPassedX: 1.25,

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
      kicker: "11:47 PM · ANNIVERSARY NIGHT",
      title: "The cheapest apartment in the city.",
      speaker: "Narrator",
      text: "You two finally move into a suspiciously cute apartment. The rent is low, the lighting is romantic, and the lease has seventeen pages nobody read."
    },
    {
      kicker: "11:48 PM · THE FRONT DOOR LOCKS",
      title: "Clause 13 wakes up.",
      speaker: "Dr. Fluffles",
      text: "Congratulations on cohabitation. Before midnight, your lease requires a Compatibility Inspection. Failure means I keep the deposit, the sofa, and possibly the cat."
    },
    {
      kicker: "TRIAL ONE · SHARED DECISIONS",
      title: "Moving Day From Hell",
      speaker: "Dr. Fluffles",
      text: "Put the sofa in the Cozy Corner. The rug hates traction, the door hates timing, and the cat hates peace. I will be observing professionally and enjoying this personally."
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
