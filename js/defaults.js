// Default rules for a new Kalamela edition (MTYS Kalamela Manual, rev. 2026, and the
// Mumbai Diocese judging sheets). Admins change these per year on the Rules screen;
// this file is only the starting point for the very first edition.

const C20 = (...names) => names.map(name => ({ name, max: 20 }));
const ind = (name, criteria, extra = {}) => ({ name, type: "individual", gender: "Any", judges: 2, criteria, ...extra });
const team = (name, min, max, criteria, extra = {}) => ({ name, type: "team", gender: "Any", judges: 2, teamMin: min, teamMax: max, substitutes: 2, criteria, ...extra });

const SOLO = C20("Voice / vocal texture", "Pitch & Tone", "Musical / emotive expression", "Rhythm", "Diction");
const ELOC = [{ name: "Use of Bible & verses", max: 20 }, { name: "Poise", max: 15 }, { name: "Diction", max: 15 }, { name: "Eloquence", max: 15 },
              { name: "Clarity of ideas", max: 15 }, { name: "Fluency", max: 10 }, { name: "Prosody", max: 10 }];
const BIBLE = C20("Accuracy / precision", "Voice control & modulation", "Pronunciation", "Style of presentation", "Speed in locating");
const ESSAY = C20("Language proficiency", "Organisation of facts", "Style of presentation", "Knowledge of subject", "Biblical references");
const STORY = C20("Language", "Creativity & originality", "Mode of expression", "Aesthetic quality", "Style of presentation");
const POEM = C20("Language", "Creativity & originality", "Rhythm", "Aesthetic quality", "Style of presentation");
const RECIT = [{ name: "Memorisation", max: 25 }, { name: "Diction", max: 25 }, { name: "Voice modulation & expression", max: 25 }, { name: "Communication of meaning", max: 25 }];

export const DEFAULT_CONFIG = {
  eventDate: "2026-12-12",
  venue: "Chembur MTSC",
  groups: [
    { code: "g1", label: "Group I", from: "2009-01-01", to: "" },
    { code: "g2", label: "Group II", from: "1992-01-01", to: "2008-12-31" },
  ],
  maxIndividualEvents: 4,
  minPercent: 50,
  awardMinPoints: 13,
  points: { individual: [5, 3, 1], team: [15, 10, 5] },
  fees: { individual: 100, team: 200, sakha: 750, food: 260 },
  events: [
    ind("Solo Malayalam (Male)", SOLO, { gender: "Male" }),
    ind("Solo Malayalam (Female)", SOLO, { gender: "Female" }),
    ind("Solo English (Male)", SOLO, { gender: "Male" }),
    ind("Solo English (Female)", SOLO, { gender: "Female" }),
    ind("Instrumental – Wind", C20("Tone quality", "Musical feel", "Rhythm", "Improvisation", "Pitch & Rhythm")),
    ind("Instrumental – String", C20("Tone quality", "Musical feel", "Rhythm", "Bowing / plucking", "Efficiency in playing")),
    ind("Instrumental – Keyboard", C20("Tone quality", "Musical feel", "Rhythm", "Improvisation", "Technique")),
    ind("Instrumental – Percussion", C20("Tone quality", "Finger / hand dexterity", "Tempo & Rhythm", "Improvisation", "Presentation style")),
    ind("Elocution Malayalam", ELOC),
    ind("Elocution English", ELOC),
    ind("Bible Reading Malayalam", BIBLE),
    ind("Bible Reading English", BIBLE),
    ind("Essay Writing Malayalam", ESSAY),
    ind("Essay Writing English", ESSAY),
    ind("Story Writing Malayalam", STORY),
    ind("Story Writing English", STORY),
    ind("Poem Writing Malayalam", POEM),
    ind("Poem Writing English", POEM),
    ind("Poetry Recitation Malayalam", RECIT),
    ind("Poetry Recitation English", RECIT),
    ind("Clay Modelling", [{ name: "Theme-based creation", max: 30 }, { name: "Completeness / finish", max: 30 }, { name: "Combination", max: 20 }, { name: "Creativity & originality", max: 20 }]),
    ind("Quiz", [{ name: "Prescribed Bible portions", max: 50 }, { name: "General Bible & Church", max: 30 }, { name: "General knowledge", max: 20 }], { judges: 1 }),
    ind("Pencil Drawing", C20("Relevance", "Composition", "Skill in execution", "Lines, strokes & shadows", "Completeness / finish")),
    ind("Painting", C20("Relevance", "Composition", "Use of colour", "Artistic style", "Completeness / finish")),
    ind("Cartoon (Pencil)", C20("Christian relevance", "Artistic expression", "Satire & social criticism", "Composition", "Sense of humour")),
    team("Group Song", 7, 14, [{ name: "Pitch", max: 30 }, { name: "Rhythm", max: 30 }, { name: "Coordination & harmony", max: 30 }, { name: "Clarity of notes", max: 10 }]),
    team("Margamkali (Female)", 6, 12, C20("Costume", "Devotion, expression & coordination", "Rhythm", "Footwork", "Music"), { gender: "Female" }),
    team("Choreography", 5, 14, [{ name: "Costume & appropriateness", max: 20 }, { name: "Rhythm / timing", max: 15 }, { name: "Expression", max: 15 },
                                 { name: "Footwork / steps", max: 15 }, { name: "Presentation", max: 20 }, { name: "Props / materials", max: 15 }], { needsSong: true }),
    team("Tableau", 1, 10, [{ name: "Costume", max: 20 }, { name: "Portrayal of theme", max: 30 }, { name: "Props / materials", max: 25 }, { name: "Still display", max: 25 }]),
    team("Mime", 6, 10, C20("Theme & message", "Acting & expressions", "Coordination", "Creativity & originality", "Overall presentation")),
  ],
};
