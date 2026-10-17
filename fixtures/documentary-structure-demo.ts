// Synthetic compiler/load fixture, not a publishable documentary or a source check.
import type {DocumentaryInput} from '../src/documentary.ts';
export function documentaryStructureDemo(): DocumentaryInput {
  const titles = ['扉の前の問い', '直感の鏡', '仕組みの歯車', '日常への窓', '本人の考察', '結びの余白'];
  const text = 'あなたは架空の街で音楽を選ぶ場面を想像できますか？これは仕組みの説明を組み立てるための架空の例です。画面の左には選ぶ前の状況を置き、右には選んだ後の状況を置きます。私たちは問いと説明の対応をたどりながら、図形が指し示す意味を確認していきましょう。ここで登場する人や出来事は実在の調査結果を表していません。';
  return {
    schema: 1, id: 'documentary-structure-demo', title: 'なぜ同じ曲を選ぶのか？構造検証デモ',
    promise: '日常の問いから章立てと説明の流れを検証する',
    intro: {text: '架空の街の音楽選びを使った長尺構造の検証です。公開用台本ではありません。', fictional: true},
    hooks: ['選択の仕組み', '他者の情報'],
    // Definitions only: these are never automatically treated as verified claims.
    sources: [
      {id: 'musiclab-2006', title: 'Salganik, Dodds & Watts (2006), Science 311, 854–856', year: 2006, primary: true,
        url: 'https://www.princeton.edu/~mjs3/salganik_dodds_watts06_full.pdf', accessedAt: '2026-10-16'},
      {id: 'musiclab-2008', title: 'Salganik & Watts (2008), Leading the Herd Astray', year: 2008, primary: true,
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3785310/', accessedAt: '2026-10-16'},
    ], checks: [],
    chapters: titles.map((title, i) => i === 4 ? {title, reflection: true, paragraphs: []} : {
      title, paragraphs: [{text: text.repeat(7) + (i === 5 ? 'この説明は効果や結果を保証するものではありません。' : ''),
        kind: 'fictional', metaphor: i % 2 ? 'CausalFlow' : 'Spotlight', purpose: '架空の選択の前後関係を示す',
        diagram: {type: 'flow', items: ['問い', '選ぶ', '振り返る']}}],
    }),
  };
}
