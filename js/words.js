/* Word lists and generators for Keyblaze. */
(function (root) {
  'use strict';

  const COMMON = (
    'the be to of and a in that have it for not on with he as you do at this but his by from they we say her she ' +
    'or an will my one all would there their what so up out if about who get which go me when make can like time no ' +
    'just him know take people into year your good some could them see other than then now look only come its over ' +
    'think also back after use two how our work first well way even new want because any these give day most us ' +
    'great between need large often hand high place hold turn small number off always move live point city play ' +
    'light state school night home water room mother area money story fact month lot right study book eye job word ' +
    'business issue side kind head house service friend father power hour game line end member law car name ' +
    'president team minute idea kid body information nothing ago lead social understand whether watch together ' +
    'follow around parent stop face anything create public already speak others read level allow add office spend ' +
    'door health person art sure such war history party within grow result open change morning walk reason low win ' +
    'research girl guy early food before moment himself air teacher force offer enough both education across ' +
    'although remember foot second boy maybe toward able age policy everything love process music including ' +
    'consider appear actually buy probably human wait serve market die send expect sense build stay fall oh nation ' +
    'plan cut college interest death course someone experience behind reach local kill six remain effect yeah ' +
    'suggest class control raise care perhaps little late hard field else pass former sell major sometimes require ' +
    'along development themselves report role better economic effort decide rate strong possible heart drug show ' +
    'leader light voice wife whole police mind finally pull return free military price less according decision ' +
    'explain son hope develop view relationship carry town road drive arm true federal break difference thank ' +
    'receive value international building action full model join season society tax director position player agree ' +
    'especially record pick wear paper special space ground form support event official whose matter everyone ' +
    'center couple site project hit base activity star table court produce eat american teach oil half situation ' +
    'easy cost industry figure street image itself phone either data cover quite picture clear practice piece land ' +
    'recent describe product doctor wall patient worker news test movie certain north personal simply third ' +
    'technology catch step baby computer type attention draw film tree source red nearly organization choose cause ' +
    'hair century evidence window difficult listen soon culture billion chance brother energy period summer realize ' +
    'hundred available plant likely opportunity term short letter condition choice single rule daughter administration ' +
    'south husband floor campaign material population economy medical hospital church close thousand risk current ' +
    'fire future wrong involve defense anyone increase security bank myself certainly west sport board seek per ' +
    'subject officer private rest behavior deal performance fight throw top quickly past goal bed order author fill ' +
    'focus drop blood upon agency push nature color store reduce sound note fine near movement page enter share ' +
    'common poor natural race concern series significant similar hot language each usually response dead rise ' +
    'animal factor decade article shoot east save seven artist away scene stock career despite central eight thus ' +
    'treatment beyond happy exactly protect approach lie size dog fund serious occur media ready sign thought list ' +
    'individual simple quality pressure accept answer resource identify left meeting determine prepare disease ' +
    'whatever success argue cup particularly amount ability staff recognize indicate character growth loss degree ' +
    'wonder attack herself region television box training pretty trade election everybody physical lay general ' +
    'feeling standard bill message fail outside arrive analysis benefit sex forward lawyer present section ' +
    'environmental glass skill sister professor operation financial crime stage ok compare authority miss design ' +
    'sort act ten knowledge gun station blue strategy clearly discuss indeed truth song example democratic check ' +
    'environment leg dark various rather laugh guess executive prove hang entire rock forget claim remove manager ' +
    'enjoy network legal religious cold final main science green memory card above seat cell establish nice trial ' +
    'expert spring firm radio visit management avoid imagine tonight huge ball finish yourself theory impact respond ' +
    'statement maintain charge popular traditional onto reveal direction weapon employee cultural contain peace ' +
    'pain apply play measure wide shake fly interview manage chair fish particular camera structure politics ' +
    'perform bit weight suddenly discover candidate production treat trip evening affect inside conference unit ' +
    'style adult worry range mention deep edge specific writer trouble necessary throughout challenge fear shoulder ' +
    'institution middle sea dream bar beautiful property instead improve stuff'
  ).split(' ');

  const UNIQUE_WORDS = Array.from(new Set(COMMON.filter(Boolean)));

  const MIN_POOL = 40;

  const PUNCT_ENDINGS =['.', ',', '!', '?', ';', ':'];

  function pickRandom(list, rng) {
    return list[Math.floor(rng() * list.length)];
  }

  /**
   * Builds a list of words for a test.
   * @param {number} count number of words to generate
   * @param {{punctuation?: boolean, numbers?: boolean, rng?: () => number}} options
   * @returns {string[]}
   */
  /** Words within the length limits; falls back to every word if the limits leave too few. */
  function wordPool(minLength, maxLength) {
    const min = minLength || 0;
    const max = maxLength || Infinity;
    if (!min && max === Infinity) return UNIQUE_WORDS;
    const pool = UNIQUE_WORDS.filter((w) => w.length >= min && w.length <= max);
    return pool.length >= MIN_POOL ? pool : UNIQUE_WORDS;
  }

  function generateWords(count, options) {
    const opts = options || {};
    const rng = opts.rng || Math.random;
    const pool = wordPool(opts.minLength, opts.maxLength);
    const words = [];
    let capitalizeNext = Boolean(opts.punctuation);

    for (let i = 0; i < count; i += 1) {
      let word = pickRandom(pool, rng);
      // Avoid the same word twice in a row; it feels broken to the typist.
      if (words.length > 0 && words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '') === word) {
        word = pickRandom(pool, rng);
      }
      if (opts.numbers && rng() < 0.1) {
        word = String(Math.floor(rng() * 1000));
      }
      if (opts.punctuation) {
        if (capitalizeNext) {
          word = word.charAt(0).toUpperCase() + word.slice(1);
          capitalizeNext = false;
        }
        if (rng() < 0.15) {
          const ending = pickRandom(PUNCT_ENDINGS, rng);
          word += ending;
          capitalizeNext = ending === '.' || ending === '!' || ending === '?';
        }
      }
      words.push(word);
    }
    return words;
  }

  const api = { generateWords, WORD_LIST: UNIQUE_WORDS };
  root.TT = Object.assign(root.TT || {}, { words: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
