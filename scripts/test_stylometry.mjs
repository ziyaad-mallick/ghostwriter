import { buildProfile, analyze } from '../docs/js/stylometry.js';

// ~900 words of one consistent casual voice (the author)
const author = [
`ok so honestly today was kinda all over the place. i woke up late again, like properly late, and i just couldn't be bothered to rush. made coffee, sat around, scrolled for way too long. i mean i know i do this every single day but whatever, it's fine. my brain just doesn't switch on till like noon and i've kinda made peace with that.`,
`anyway i finally got round to the thing i've been putting off for weeks. it wasn't even that bad? funny how that works. you build it up in your head and then it's like, oh, that took twenty minutes. i really need to stop doing that to myself honestly. like every time it's the same and every time i forget.`,
`later me and sam went to grab food and we just ended up talking for hours. didn't really do anything productive after that but i don't think i care. some days are just for messing about and that's ok. gonna try to sleep earlier tonight but lol we'll see. i say that basically every night and it never happens.`,
`the weather's been weird too, grey and kinda cold but not properly cold. i kinda like it though. makes me wanna stay in with a book. been reading that one i mentioned, it's slow but i'm into it. anyway that's basically my whole day, nothing wild, just vibes really. i think i needed a slow one to be fair.`,
`work was alright i guess. nothing mad happened. had a couple of those meetings that could've been an email but you know how it is. i just nodded along and did my own thing after. my manager's sound though so i can't complain really. could be way worse honestly.`,
`oh and i tried that recipe finally, the pasta thing. it came out ok? bit too much salt but edible. i never measure anything which is probably the issue but measuring feels like too much effort for a tuesday. i'll wing it again next time and probably mess it up the same way.`,
`been thinking about getting back into running but like, thinking about it is as far as i've got. every morning i'm like yeah tomorrow, and then tomorrow comes and i'm like nah. classic. maybe i'll just start small, like a walk, and not make it a whole thing in my head.`,
`talked to mum on the phone for a bit too. she's good, same as ever, worrying about stuff she doesn't need to worry about. i told her i'm fine like a hundred times. anyway it was nice to catch up even if half of it was her telling me to eat better lol.`];

// held-out, SAME voice (should score HIGH)
const selfHeldOut = `honestly today felt a bit better than yesterday. still woke up later than i wanted but whatever, i actually got stuff done for once. made coffee, sat about for a bit, then just cracked on with it. funny how it's never as bad as i think it'll be. me and sam might grab food later, we'll see how i feel. kinda cold out but i don't really mind it, makes me wanna stay in honestly.`;

// generic AI diary (should score LOW)
const aiDiary = `Today was a day of quiet reflection and meaningful progress. I began the morning with a sense of purpose, taking time to organize my thoughts and set clear intentions for the hours ahead. Throughout the day, I focused on completing several important tasks, each of which contributed to a growing sense of accomplishment. In the afternoon, I took a moment to appreciate the beauty of the changing weather, which served as a gentle reminder of the importance of balance and gratitude in everyday life.`;

// a different real human, formal register (should score LOW)
const formalHuman = `I spent the afternoon revising the quarterly report. The figures required careful reconciliation, and several discrepancies emerged that demanded attention. After consulting the records, I determined that the variance stemmed from an accounting error in the prior period. I have flagged the issue for review and expect it will be resolved before the deadline.`;

const profile = buildProfile(author);
console.log(`profile: words=${profile.wordCount} chunks=${profile.chunkCount} anchorMean=${profile.anchorMean.toFixed(3)} anchorStd=${profile.anchorStd.toFixed(3)} mfw=${profile.selectedIdx.length}\n`);

for (const [name, t] of [['SELF held-out', selfHeldOut], ['AI diary', aiDiary], ['formal human', formalHuman]]) {
  const r = analyze(t, profile);
  console.log(`${name.padEnd(14)} score=${String(r.score).padStart(3)}  cos=${r.cos.toFixed(3)}  z=${r.z.toFixed(2)}  [${r.verdict}]`);
}
console.log('\nAI tells:', analyze(aiDiary, profile).tells.slice(0, 4));
