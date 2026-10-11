// 解析JSON（motion-lab/analysis@1）の型。解析器（tools/）とRemotionの合成（src/）で共有する。型だけを置き、実行コードは置かない。

/**
 * 値の確からしさ。
 * measured: フレームから直接測った値。estimated: モデルの当てはめ等で推定した値。
 * ambiguous: 候補が複数あり決めきれない（最良候補を併記）。lower_bound / upper_bound: 片側だけ分かる。
 * unknown: 観測できない・解析できない（理由を必ず書く）。
 */
export type Status = 'measured' | 'estimated' | 'ambiguous' | 'lower_bound' | 'upper_bound' | 'unknown';

export type EasingName =
  | 'linear'
  | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInSine' | 'easeOutSine' | 'easeInOutSine'
  | 'easeInExpo' | 'easeOutExpo'
  | 'easeInBack' | 'easeOutBack';

export type ChannelName = 'cx' | 'cy' | 'w' | 'h' | 'angle' | 'opacity';

/** 再現用の区間。f0〜f1（小数フレーム、動画先頭基準）でv0→v1へ動く。 */
export type ChannelSegment = {
  f0: number;
  f1: number;
  v0: number;
  v1: number;
  /** named: イージング関数で補間。samples: 測定値を折れ線で補間（イージングを断定できない場合）。 */
  easing: {kind: 'named'; name: EasingName} | {kind: 'samples'; frames: number[]; values: number[]};
  /** trueのとき、v0またはf0は観測ではなく当てはめの値（画面外の開始など）。 */
  model: boolean;
};

export type Channel = {initial: number; segments: ChannelSegment[]};

export type RenderShape = 'rect' | 'ellipse' | 'roundrect';

/** Remotionで描くための情報。channelsのcx/cyは中心、w/hは回転前の大きさ（px）、angleは度（時計回り）、opacityは0〜1。 */
export type ElementRender = {
  from: number;
  to: number;
  shape: RenderShape;
  cornerRadius: number;
  color: string;
  channels: Record<ChannelName, Channel>;
};

export type TimePoint = {
  frame: number | null;
  time: number | null;
  status: Status;
  /** 当てはめで求めた時刻（statusがupper_bound等のとき、断定ではなくモデル上の値）。 */
  modelFrame?: number;
  uncertaintyFrames?: number;
  reason?: string;
};

export type EasingResult = {
  status: Status;
  best: EasingName | null;
  /** 振幅で正規化した二乗平均平方根誤差。 */
  nrmse: number | null;
  candidates: {name: EasingName; nrmse: number}[];
  reason?: string;
};

export type AnimationType = 'translate' | 'scale' | 'grow' | 'resize' | 'fade-in' | 'fade-out' | 'rotate';

export type Animation = {
  id: string;
  type: AnimationType;
  channels: ChannelName[];
  start: TimePoint;
  end: TimePoint;
  from: {values: Partial<Record<ChannelName, number | null>>; status: Status; reason?: string};
  to: {values: Partial<Record<ChannelName, number | null>>; status: Status; reason?: string};
  direction?: {angleDeg: number; label: string; status: Status};
  speed?: {averagePxPerSec: number | null; peakPxPerSec: number; status: Status; basis: string};
  anchor?: string;
  overshoot?: number;
  easing: EasingResult;
  perChannel: {channel: ChannelName; f0: number; f1: number; v0: number | null; v1: number | null; easing: EasingResult}[];
};

export type ElementAnalysis = {
  id: string;
  scene: number;
  observed: {firstFrame: number; lastFrame: number; frames: number; clippedFrames: number};
  shape: {value: 'rectangle' | 'rounded-rectangle' | 'circle' | 'ellipse' | null; status: Status; fillRatio: number | null; cornerRadius: number | null; reason?: string};
  color: {value: string | null; rgb: [number, number, number] | null; status: Status; spread: number | null; reason?: string};
  layout: {
    final: {left: number; top: number; width: number; height: number; cx: number; cy: number; angleDeg: number};
    normalized: {cx: number; cy: number; width: number; height: number};
    alignment: string[];
    status: Status;
  };
  animations: Animation[];
  render: ElementRender;
  /** フレームごとの実測値（見切れの復元を含む。観測できないフレームは含まない）。比較に使う。 */
  series: Record<ChannelName, {frames: number[]; values: number[]}>;
  notes: string[];
};

export type Scene = {
  index: number;
  startFrame: number;
  endFrame: number;
  start: number;
  end: number;
  background: {color: string | null; coverage: number; status: Status; reason?: string};
  cut: {method: string; scdetScore: number | null; changedFraction: number | null};
};

export type MotionSegment = {
  index: number;
  scene: number;
  startFrame: number;
  endFrame: number;
  start: number;
  end: number;
  peakChangedFraction: number;
  frames: {dir: string; count: number; contactSheet: string} | null;
  elements: string[];
};

export type Analysis = {
  schema: 'motion-lab/analysis@1';
  generatedAt: string;
  tool: {name: string; version: string; ffmpeg: string};
  source: {path: string; sha256: string; bytes: number; rightsNote: string};
  video: {width: number; height: number; fps: number; frameCount: number; duration: number; hasAudio: boolean};
  params: Record<string, number>;
  scenes: Scene[];
  motionSegments: MotionSegment[];
  elements: ElementAnalysis[];
  unresolved: {item: string; reason: string}[];
  assumptions: string[];
};
