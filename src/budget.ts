// 費用の事前見積りと上限判定（T023）。外部呼出なし。単価はconfig/pricing.json（確認日つき）。
export type PriceItem={confirmedAt?:string;inputPerMTok?:number;outputPerMTok?:number;perThousandChars?:number;audioOutputPerMTok?:number;audioTokensPerSecond?:number;creditsPerSecond?:number;usdPerCredit?:number};
export type Pricing={currency:string;items:Record<string,PriceItem>};
function item(p:Pricing,id:string):PriceItem{const i=p.items[id];if(!i||!/^\d{4}-\d{2}-\d{2}$/.test(i.confirmedAt??''))throw Error(`単価または確認日がありません: ${id}`);return i}
function num(v:number|undefined,name:string){if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error(`単価が不正: ${name}`);return v}
function qty(n:number,name:string){if(!Number.isFinite(n)||n<0)throw Error(`数量が不正: ${name}`);return n}
export function estimateText(p:Pricing,id:string,inTok:number,outTok:number){const i=item(p,id);return qty(inTok,'in')/1e6*num(i.inputPerMTok,'inputPerMTok')+qty(outTok,'out')/1e6*num(i.outputPerMTok,'outputPerMTok')}
export function estimateTtsChars(p:Pricing,id:string,chars:number){return qty(chars,'chars')/1000*num(item(p,id).perThousandChars,'perThousandChars')}
export function estimateTtsAudio(p:Pricing,id:string,inTok:number,seconds:number){const i=item(p,id);return qty(inTok,'in')/1e6*num(i.inputPerMTok,'inputPerMTok')+qty(seconds,'seconds')*num(i.audioTokensPerSecond,'audioTokensPerSecond')/1e6*num(i.audioOutputPerMTok,'audioOutputPerMTok')}
export function estimateVideo(p:Pricing,id:string,seconds:number){const i=item(p,id);return qty(seconds,'seconds')*num(i.creditsPerSecond,'creditsPerSecond')*num(i.usdPerCredit,'usdPerCredit')}
// 上限判定: 確定額 + 実行中の見込額 + 費用不明の保持額 + 今回の見積り が上限を超えるなら拒否（SPEC: 費用は確定額に実行中見込額を加える）。
// unknown（T098）: 処理されたか分からない試行の見積り。照合で費用が判明するまで解放せず、上限判定に含める。
export class Budget{
committed=0;reserved=0;unknown=0;limit:number;
 constructor(limit:number){if(!Number.isFinite(limit)||limit<0)throw Error('上限が不正');this.limit=limit}
 reserve(estimate:number){qty(estimate,'estimate');if(this.committed+this.reserved+this.unknown+estimate>this.limit)throw Error(`上限超過: 確定${this.committed}+見込${this.reserved}+費用不明${this.unknown}+今回${estimate} > ${this.limit}`);this.reserved+=estimate}
 settle(estimate:number,actual:number){qty(actual,'actual');this.reserved=Math.max(0,this.reserved-estimate);this.committed+=actual}
 release(estimate:number){this.reserved=Math.max(0,this.reserved-estimate)}
 // 実行中の予約を費用不明として保持する。
 holdUnknown(estimate:number){this.reserved=Math.max(0,this.reserved-estimate);this.unknown+=estimate}
 // 照合で費用が判明した不明分を確定する。呼出側は1試行につき1回だけ呼ぶ。
 resolveUnknown(estimate:number,actual:number){qty(actual,'actual');this.unknown=Math.max(0,this.unknown-estimate);this.committed+=actual}
}
