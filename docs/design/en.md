# FMS — Design Description

*Fremdsprachen machen Spaß: "Learning foreign languages is fun!"*

---

## The Core Idea

FMS is built on a simple conviction: **language fluency comes from accumulated exposure and active recall, not from structured drills**. A learner who has heard a word in a podcast, looked it up, read it in a sentence, typed it into a flashcard, and then been tested on it a week later owns that word in a way that a textbook exercise cannot produce. FMS is a platform for building that kind of knowledge, piece by piece, over a long period of time.

The platform is intentionally personal and self-directed. There is no curriculum, no fixed lesson plan, no prescribed sequence. The learner chooses their materials — audio from a German news program, a book they are reading, words they heard in conversation — and the system helps them retain and deepen what they encounter naturally.

---

## The Learning Cycle

The platform is organized around a cycle of four activities that feed into each other:

**Input → Capture → Consolidation → Production**

1. **Input**: The learner encounters the language through real materials — listening to audio, watching video, reading a book sentence by sentence.
2. **Capture**: Interesting words, sentences, structures, or questions are saved as flashcards or notes while the impression is fresh.
3. **Consolidation**: The spaced repetition system surfaces cards at optimal intervals, so effort is focused on what is about to be forgotten, not what is already known.
4. **Production**: The learner practices outputting the language — recording speech, writing blog posts in the target language, or participating in Q&A with others.

The cycle repeats continuously. A word heard in a podcast becomes a card. That card is reviewed until it reaches familiarity level 6 (mastered). Later, the same word might appear in a reading passage, and the learner annotates it with a note that links back to when they first encountered it.

---

## The Five Pillars

### 1. Flashcards and Spaced Repetition

The flashcard system is the backbone of the platform. Each card has a **question**, an **answer**, an optional **suggestion** (a hint or partial clue), and a **note** for additional context.

Cards are tracked on a **familiarity scale from 0 to 6**:

| Level | Meaning |
|-------|---------|
| 0 | Just added, never tested |
| 1–2 | Seen but unreliable |
| 3–4 | Recognized with effort |
| 5 | Solidly known |
| 6 | Mastered — no further review needed |

The testing algorithm uses **SM-2 spaced repetition**: each correct recall extends the interval before the next review, while incorrect recall resets the interval. The system weights card selection by familiarity — low-familiarity cards appear more frequently. The learner controls the pace; they decide whether their recall was strong enough to advance.

Cards are organized by **tags**, which function as named collections. Tags can be private or shared publicly for others to subscribe to. A card can belong to multiple tags.

The system also detects **incomplete cards** — cards where either the question or the answer is missing. These represent vocabulary or structures the learner has noticed but not yet fully processed, and they appear as a dedicated queue for follow-up.

**AI-assisted improvement**: The Gemini model can analyze existing cards and suggest better phrasings, missing context, or more precise answers. The learner reviews each suggestion and decides whether to apply it. The AI assists; the learner decides.

### 2. Listening and Dictation

The listening module lives at a single page (`/listen/media`) that combines a media library, a player, and all practice tools in one place. The learner brings authentic audio or video — news programs, podcasts, educational videos — and the page gives them everything needed to work with it.

**Layout**: The page is split into a left sidebar and a main content area. The sidebar holds the player (always visible) and below it a tag-based library for navigating the media collection. The main area is a tabbed workspace with five tabs: Dictation, Media, Subtitle, Transcript, and Note.

**Media tab** — manages the item itself: title, source (either a URL or an uploaded audio/video file), a freeform note, and tag assignments. A media item can be shared with others by tagging it with a public tag; shared items are browsable and playable by subscribers without them needing to make their own copy.

**Subtitle tab** — each media item can carry multiple subtitle tracks, one per user. Subtitles are stored as VTT or SRT and can be created or imported directly in the browser. The editing tools operate at the cue level: the learner can adjust the start and end timestamp of any cue (by typing or by pinning to the current playback position), merge adjacent cues, split a cue, insert new ones, or delete. An "edit as text" mode allows direct editing of the raw subtitle text for bulk corrections. A special "Invalid Subtitle" filter across the library surfaces any media item that has subtitle entries with zero-length or malformed timing, making it easy to find and fix broken tracks.

**Transcript tab** — full plain-text transcripts of the audio, stored independently from the subtitle. These serve as reading material and reference rather than practice material.

**Note tab** — freeform notes about the media item, for anything the learner wants to record: vocabulary observations, cultural context, questions.

**Dictation tab** — the primary active listening practice. The learner selects a subtitle track and each cue appears as a numbered card. For each cue, the learner types what they hear into an input field. The system checks the answer in real time (punctuation is ignored) and turns the cue's index chip green on a correct match. A tip line below the input field shows which words have not yet been typed, with unguessed words replaced by underscores — giving partial feedback without giving away the answer. Pressing the play button (or Ctrl+S / Ctrl+D, or typing two spaces) replays just that cue's audio segment. If a translation was stored on the cue, a tooltip button reveals it as a hint. The learner can also switch a cue into edit mode inline without leaving dictation — useful for correcting a subtitle error the moment it is noticed — and can open any cue directly as a new flashcard with one click.

Progress is tracked per media/subtitle pair: a counter shows how many cues have been marked correct, and the learner can mark the entire session complete when finished. Progress is saved automatically.

Outside of dictation mode, the active cue is highlighted in a prominent display above the player during normal playback, so the learner can follow along without the input field.

### 3. Reading

The reading module takes the approach of **sentence-level engagement with books**. Rather than presenting a full page of text, the platform organizes a book into chapters and chapters into sentences, each of which can be navigated individually.

This slows reading down deliberately. The learner can:
- Read a sentence, pause, and absorb it before moving on
- Add a **word annotation** to any word in the sentence (lemma, part of speech, notes)
- Attach an **audio recording** to a sentence — either their own voice reading it aloud, or a reference recording
- Color-code sentences for later reference

The hierarchical structure (book → chapter → section → sentence) mirrors how real texts are organized, and the learner can jump to any point in the book. The pure-text view presents the book as flowing prose, without the sentence-by-sentence apparatus, for a more natural reading experience when that is what the learner wants.

The reading module is closely linked to the flashcard system: a word encountered while reading can be immediately added as a new card without losing the reading context.

### 4. Speaking and Production

The speaking module contains three distinct practices:

**Shadowing / pronunciation practice**: The learner loads a sentence or passage of target-language text. The system generates a native-sounding audio reading via Gemini's text-to-speech. The learner records their own reading and submits it for speech-to-text transcription. The transcribed text is then compared to the original using a longest-common-subsequence diff, highlighting words and phrases that were dropped, mispronounced, or altered. The learner can iterate — record, compare, record again — until the performance matches the model.

**Just Speaking**: A low-friction audio upload for free-form practice. The learner records anything — a spontaneous monologue, a prepared paragraph, a retelling of something they read — and uploads it. There is no scoring, no right answer. The purpose is to build the habit of producing the language.

**Q&A**: A shared forum where learners post questions with supporting audio, video, or text, and receive answers from other members. The questions can be about anything: grammar, vocabulary, a phrase they heard and did not understand. This is the platform's social layer — the place where the individual learner's practice connects to a small community.

### 5. Vocabulary Exploration

The **Top Words** tool presents German vocabulary ranked by corpus frequency, filtered against the learner's existing cards. Words the learner has already captured are excluded; what remains is a sorted list of high-value words the learner does not yet know. This is useful for deliberate vocabulary expansion when the learner does not have a specific text to work from.

The **sentence search** tool finds example sentences containing a given word, providing contextual evidence of how the word is actually used — more useful than a dictionary definition alone.

---

## Supporting Features

### Datasets and Sharing

The tag system doubles as a sharing mechanism. A learner can make a tag public, and other learners can subscribe to it or copy its cards into their own collection. This allows a learner who has built a card set on, say, German irregular verbs or news vocabulary to share that work with others.

The **dataset marketplace** is the discovery surface for this: it lists public tags and card sets from all users, filterable by contributor.

### Study Planning

The **plan** feature lets the learner define study commitments — a description of what they intend to study and how much time they plan to spend — and record actual sessions against those plans. It is a lightweight time-tracking tool anchored in intention rather than in automated measurement. The homepage can display an optional reminder of the learner's active plans.

The **motto** feature is smaller still: a personal message displayed on the homepage as a reminder of why the learner is doing this. It belongs to the same category of self-motivation scaffolding — external aids for sustaining a long-term habit.

### Blog

The learner can write blog posts in any language using a Markdown editor. The blog serves two purposes: it is a **writing practice** space (composing in the target language is valuable production practice), and it is a **personal log** of what the learner is thinking about and working on. Other users' blog posts are visible, creating a light social dimension.

### AI Integration

AI appears throughout the platform in a supporting role:

- **Card improvement**: Gemini suggests better versions of existing cards; the learner approves or rejects.
- **Speech-to-text**: Gemini transcribes the learner's recorded audio for comparison with the original text.
- **Text-to-speech**: Gemini generates native-sounding audio for speaking practice passages, with selectable voices.

In every case, the AI produces a suggestion or a transformation, and the learner acts on it or ignores it. The platform is not AI-driven; it is learner-driven, with AI available as a tool.

---

## Design Principles

**Real materials over artificial exercises.** The platform does not generate practice content. The learner brings authentic materials — things they actually want to understand — and the platform helps them extract learning value from those materials.

**Capture at the point of encounter.** The most valuable moment to add a card is the moment of confusion or curiosity, before the impression fades. The card creation flow is designed to be fast; the learner should not have to interrupt their workflow for long to record something.

**Long-term memory as infrastructure.** A card that reaches familiarity level 6 represents a permanent investment. The spaced repetition system is not a quiz; it is a memory management system. The goal is not to study — the goal is to never have to study the same thing twice.

**Progress through accumulation, not completion.** There is no lesson to finish, no badge to earn, no streak to maintain. Progress is the slow accumulation of known words, understood sentences, and fluent recordings. The platform tries to make that accumulation visible — through familiarity counts, card counts, plan records — without gamifying it.

**The learner is in control.** Filters, tags, familiarity levels, card organization, study plans — these are all tools the learner configures to fit their own style and priorities. The platform does not tell the learner what to do next.

---

## What the Platform Is Not

FMS is not a language course. It does not explain grammar rules, sequence lessons by difficulty, or certify proficiency. It assumes the learner already has some goal — perhaps reading German novels, understanding German podcasts, or speaking with colleagues — and provides tools for working toward that goal through accumulated practice.

It is also not a social network. The sharing and Q&A features exist to reduce friction for learners who benefit from community, not to build an engagement-driven product. The core experience is individual.

---

## The Whole Picture

Seen from a distance, FMS is a **personal knowledge management system for language learning**. The learner moves through the world encountering the target language in many forms. FMS provides a place to capture what they encounter, a system for converting encounters into durable memory, and tools for practicing the productive side of the language.

The platform is held together by the flashcard system. Every other module — listening, reading, speaking, vocabulary exploration — either generates material for cards or reinforces what the cards contain. The card set grows over time into a map of everything the learner has encountered and worked to understand. The spaced repetition system ensures that map stays alive — not archived, but actively maintained in working memory.

This is language learning as a long-term project, sustained by good tooling.
