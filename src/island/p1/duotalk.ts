/**
 * 段 P2：ヒーローの組み合わせの掛け合いの会話（duo.ts の DUOS の id ごと。1 枚 60 字まで・3〜4 枚）。
 * 文が長いので別のファイル（起動のあとに duo.ts の loadDuoTalk で読み込む）。話す人は調査の id（画面ではいまの会社のそのヒーロー）。
 * 決まり：ゲームの中の会社の仕事の場面として穏当に（争い・裏切り・悲劇的な最期は出さない。研究ファイルの cautions）。オリジナルの文。
 */
import { t } from '../../i18n';
import type { DuoPage } from './duo';

const P = (who: number, text: () => string): DuoPage => ({ who, text });
export const DUO_TALK: Record<string, DuoPage[]> = {
  liubei3: [
    P(5009, () => t('関羽、張飛。また三人で同じ町とは、心強い。', 'Guan Yu, Zhang Fei — the three of us in one town again. How reassuring.')),
    P(4037, () => t('兄者のためなら、それがしはどの持ち場でも守り抜きます。', 'For you, brother, I will hold any post.')),
    P(4001, () => t('おう！ 三人そろえば、どんな大仕事でも片づけてやるぜ！', 'Ha! With the three of us, no job is too big!')),
    P(5009, () => t('社長、私たち三人に、一つの仕事を任せてみませんか。', 'Chief, would you trust the three of us with one job?')),
  ],
  tenka3: [
    P(5001, () => t('秀吉、家康。三人そろったな。道は余が開く。', 'Hideyoshi, Ieyasu. All three of us. I will open the road.')),
    P(2026, () => t('お任せを！ 段取りと人集めは、わしの得意でございます。', 'Leave it to me! Planning and gathering people is my strength.')),
    P(3044, () => t('わしは急がず、決めたことを長く守りましょう。', 'And I will not rush. I will keep what we decide.')),
    P(5001, () => t('社長、三人の役目を分けよ。速く、大きく、長く、だ。', 'Chief, split our roles: fast, big, and long-lasting.')),
  ],
  nobumitsu: [
    P(2020, () => t('信長様、もう少し段取りを詰めてから動きとうございます。', 'Lord Nobunaga, I would like to plan a little more before we move.')),
    P(5001, () => t('遅い。結論から申せ。考えるのは走りながらでよい。', 'Too slow. Conclusion first. Think while you run.')),
    P(2020, () => t('……社長、この二人の持ち場、少しお考えいただけませぬか。', '…Chief, might you think a little about how we two are placed?')),
  ],
  shieikan3: [
    P(4035, () => t('歳、総司。同じ町で働けるとは、道場のころを思い出すな。', 'Toshi, Soji — working in one town takes me back to our dojo days.')),
    P(4027, () => t('近藤さんが前に立つなら、決まりと段取りは俺が引き受ける。', 'If you stand in front, Kondo, I will take the rules and the planning.')),
    P(4012, () => t('僕は現場を走り回ります。三人なら毎日が稽古みたいで楽しいなあ。', 'I will run the floor. With the three of us, every day feels like practice.')),
    P(4035, () => t('社長、我ら三人、一つの隊のように使ってくだされ。', 'Chief, use the three of us as one squad.')),
  ],
  chuhan: [
    P(5025, () => t('劉邦、またお前と同じ部門か。今度も力で押し切るぞ。', 'Liu Bang, the same department again? I will push through by strength.')),
    P(5026, () => t('わしは人に任せるのがうまくてな。勝負はまだ分からんぞ。', 'I am good at letting others work. This is far from decided.')),
    P(5025, () => t('社長、どちらの手が上か、数字で決めさせてくれ。', 'Chief, let the numbers show whose way is better.')),
  ],
  currents: [
    P(4007, () => t('テスラ君か。うちの研究所を出て、交流で名を上げたそうだな。', 'Tesla. I hear you left my lab and made your name with AC.')),
    P(4041, () => t('エジソンさん。手で試すより、まず頭の中で計算すべきです。', 'Mr. Edison, one should calculate in the mind before trying by hand.')),
    P(4007, () => t('試してこそ分かる！ 社長、どちらが先に結果を出すか見ていてくれ。', 'You learn by trying! Chief, watch who gets results first.')),
  ],
  funashima: [
    P(4004, () => t('武蔵殿、また相まみえましたな。今度は商いで勝負でござる。', 'Musashi, we meet again. This time the contest is trade.')),
    P(5032, () => t('望むところ。勝負は段取りと間合いで決まる。', 'Gladly. Contests are won by preparation and timing.')),
    P(4004, () => t('社長殿、どちらの工夫が上か、確かめさせていただきたい。', 'Chief, allow us to see whose ingenuity is greater.')),
  ],
  genji: [
    P(5019, () => t('兄上、この月の成果は、それがしの持ち場が一番です！', 'Brother, my post did the best work this month!')),
    P(3051, () => t('手柄は分かっている。だが、決まりを飛ばして動くな。', 'I know your merit. But do not skip the rules.')),
    P(5019, () => t('……社長、兄上とそれがし、どう組めばよいのでしょう。', '…Chief, how should my brother and I work together?')),
  ],
  jiangdong: [
    P(2037, () => t('周瑜！ お前と同じ町なら百人力だ。', 'Zhou Yu! With you in this town, I feel a hundred strong.')),
    P(4048, () => t('伯符、勢いだけでは続かない。段取りは私に任せてくれ。', 'Bofu, momentum alone won’t last. Leave the planning to me.')),
    P(2037, () => t('大将、俺たち二人に一つ、大きな仕事をくれ！', 'Boss, give the two of us one big job!')),
  ],
  wuzhang: [
    P(4050, () => t('諸葛亮殿。あなたの策には、守りを固めて応じましょう。', 'Zhuge Liang. I shall answer your plans by holding firm.')),
    P(5015, () => t('仲達殿は慎重だ。ならば、こちらは準備を重ねるまで。', 'Zhongda is careful. Then I will prepare all the more.')),
    P(4050, () => t('社長、どちらの読みが確かか、競わせてみますか。', 'Chief, shall we see whose reading is truer?')),
  ],
  eroica: [
    P(4003, () => t('ナポレオン……かつて、あなたに曲を捧げようとしたことがあります。', 'Napoleon… I once meant to dedicate a piece to you.')),
    P(5002, () => t('ほう、それは光栄だ。で、その曲はどうなった？', 'Oh? An honor. And what became of it?')),
    P(4003, () => t('題は書き直しました。……社長、少し気まずいのですが。', 'I rewrote the title. …Chief, this is a little awkward.')),
  ],
  teplitz: [
    P(2033, () => t('ベートーヴェン君、君の音楽は私の詩より雄弁だ。', 'Beethoven, your music speaks more than my verse.')),
    P(4003, () => t('ゲーテ先生の言葉があってこそです。一緒に何か作りましょう。', 'It starts with your words, sir. Let us make something together.')),
    P(2033, () => t('閣下、言葉と音で、この店の看板を作らせてください。', 'Your Excellency, let us make this shop’s sign in words and sound.')),
  ],
  letters: [
    P(3046, () => t('アントニア、お手紙は毎月きちんと書いていますか。', 'Antonia, are you writing your letters every month?')),
    P(4014, () => t('お母さま、こちらでは毎日、報告を帳面にまとめておりますわ。', 'Mother, here I write up a report in the ledger every day.')),
    P(3046, () => t('よろしい。社長、この子を見守っていただけますね。', 'Good. Chief, you will look after her, won’t you?')),
  ],
  solvay: [
    P(5010, () => t('キュリーさん、またお会いできた。あなたの粘り強さに学ぶことばかりです。', 'Madame Curie, we meet again. Your persistence teaches me so much.')),
    P(4017, () => t('測って、確かめて、また測る。それだけですよ。', 'Measure, check, and measure again. That is all.')),
    P(5010, () => t('社長、私たちに一つ、難しい問いをください。', 'Chief, give us one hard question.')),
  ],
  twoheroes: [
    P(5003, () => t('劉備よ、天下の英雄はおぬしとわしだけだと言ったな。', 'Liu Bei, I once said the only true heroes are you and I.')),
    P(5009, () => t('恐れ入ります。ですが、私は人の和で勝負いたします。', 'You honor me. But I will compete through harmony among people.')),
    P(5003, () => t('社長、どちらのやり方が客をつかむか、見ておくがよい。', 'Chief, watch which way wins the customers.')),
  ],
  kawanakajima: [
    P(4025, () => t('謙信殿、同じ部門とは。川中島より手強い勝負になりそうじゃ。', 'Kenshin, the same department? This may be harder than Kawanakajima.')),
    P(4032, () => t('信玄殿。わしは筋を通して勝つ。抜け駆けはせぬ。', 'Shingen. I win by doing things right. No shortcuts.')),
    P(4025, () => t('社長、二人の陣立て、どう使う。', 'Chief, how will you use our two formations?')),
  ],
  kobe: [
    P(4005, () => t('よう龍馬。おめえ、また大きな話を持ってきたな。', 'Hey, Ryoma. Another big idea, eh?')),
    P(5008, () => t('先生、海の向こうと商いがしたいがじゃ。教えてつかあさい。', 'Sensei, I want to trade across the sea. Teach me.')),
    P(4005, () => t('社長、こいつは広い場所で走らせると伸びるぜ。', 'Chief, give this one room to run and he grows.')),
  ],
  edotalks: [
    P(4039, () => t('勝さあ、また話し合いで片をつけもんそ。', 'Katsu, let us settle things by talking again.')),
    P(4005, () => t('おう、西郷さん。腹を割りゃあ、たいていの揉め事は収まるもんだ。', 'Sure, Saigo. Speak frankly and most troubles settle.')),
    P(4039, () => t('社長どん、おいたちに、ややこしか交渉を任せてくいやんせ。', 'Chief, leave the tricky negotiations to us.')),
  ],
  nile: [
    P(5016, () => t('カエサル、また同じ会社とは。手を組めば、海の向こうの市場も開けますわ。', 'Caesar, the same company again. Together we can open markets overseas.')),
    P(4026, () => t('来た、見た、そして組んだ、というわけだ。', 'I came, I saw, I partnered.')),
    P(5016, () => t('社長、二人で交易の道を広げてみせますわ。', 'Chief, we will widen the trade routes together.')),
  ],
  benkei: [
    P(3018, () => t('義経様、この弁慶、どの持ち場でもお供いたしますぞ。', 'Lord Yoshitsune, Benkei will follow you to any post.')),
    P(5019, () => t('心強い。弁慶が守ってくれるなら、それがしは前だけを見られる。', 'Reassuring. With you guarding, I can look only ahead.')),
    P(3018, () => t('殿、我ら主従、重い荷も軽々と運んでみせましょう。', 'Chief, master and retainer will carry heavy loads with ease.')),
  ],
  athens3: [
    P(2044, () => t('プラトン、アリストテレス。さて、良い商いとは何だろうね？', 'Plato, Aristotle. Now, what is good trade?')),
    P(2034, () => t('先生、まず「良い」とは何かを定めましょう。', 'Teacher, first let us define “good.”')),
    P(2047, () => t('まず店を観察して、分類してみましょう。答えはそこにあります。', 'Let us observe the shops and classify. The answer is there.')),
    P(2044, () => t('社長、三人で問い続ければ、きっと何か見つかりますよ。', 'Chief, if we three keep asking, we will find something.')),
  ],
  mieza: [
    P(5017, () => t('先生！ また教わる日が来るなんて。世界の地図を広げましょう。', 'Teacher! Learning from you again — let us spread out the world map.')),
    P(2047, () => t('まずは足もとの町を観察しなさい。広げるのは、それからです。', 'First observe the town at your feet. Expand after that.')),
    P(5017, () => t('社長、先生と僕で、遠くの町まで売り込みに行きたいな！', 'Chief, my teacher and I want to sell to faraway towns!')),
  ],
  vienna: [
    P(2004, () => t('ベートーヴェン先生……同じ職場なんて、緊張します。', 'Mr. Beethoven… working at the same place makes me nervous.')),
    P(4003, () => t('肩の力を抜きなさい。君の歌は、人の心に素直に届く。', 'Relax. Your songs reach people’s hearts directly.')),
    P(2004, () => t('社長、先生のそばで、新しい品を作ってみたいです。', 'Chief, I would like to make something new beside him.')),
  ],
  rome: [
    P(2023, () => t('ラファエロ、私の工夫をまた真似るつもりか。', 'Raphael, are you going to copy my methods again?')),
    P(3041, () => t('学ばせてもらっただけですよ。僕は僕の色で仕上げます。', 'I only learned from you. I finish things in my own colors.')),
    P(2023, () => t('社長、どちらの仕事が上か、品物で見てもらおう。', 'Chief, judge by the goods whose work is better.')),
  ],
  sunbros: [
    P(2037, () => t('権、お前が来たか！ 攻めは俺、守りはお前だ。', 'Quan, you’re here! I attack, you defend.')),
    P(4018, () => t('兄上、人を集めて長く続けるのは、私に任せてください。', 'Brother, leave gathering people and lasting long to me.')),
    P(2037, () => t('大将、兄弟で一つの会社を盛り立ててみせるぜ。', 'Boss, we brothers will lift this company up.')),
  ],
  iga: [
    P(3010, () => t('家康様、道案内なら拙者にお任せを。', 'Lord Ieyasu, leave the guiding to me.')),
    P(3044, () => t('半蔵がいれば、遠回りでも無事に着ける。頼りにしておる。', 'With Hanzo, even the long way gets us there safely.')),
    P(3010, () => t('殿、遠くの仕入れ先への道、拙者が切り開きましょう。', 'Chief, I will open the road to our distant suppliers.')),
  ],
  sekigahara: [
    P(2012, () => t('家康殿、帳面の細かさなら、それがしは負けませぬ。', 'Ieyasu, I will not lose when it comes to careful books.')),
    P(3044, () => t('わしは待つのが得意でな。長い目で見て勝つとしよう。', 'I am good at waiting. I will win in the long run.')),
    P(2012, () => t('殿、どちらの段取りが確かか、競わせていただきたい。', 'Chief, let us compete to see whose planning is sound.')),
  ],
  bugyo: [
    P(2026, () => t('三成、また一緒か！ 細かい段取りはおぬしに任せるぞ。', 'Mitsunari, together again! The fine planning is yours.')),
    P(2012, () => t('はっ。数字と帳面は、それがしが一つ残らずそろえます。', 'Yes, sir. I will put every number and ledger in order.')),
    P(2026, () => t('社長、わしが人を集め、三成が回す。これで町は大きくなるぞ。', 'Chief, I gather people, he runs things. This town will grow.')),
  ],
  twocamps: [
    P(1003, () => t('関羽殿、陣営は違えど、また会えてうれしゅうござる。', 'Guan Yu, though our sides differed, I am glad we meet again.')),
    P(4037, () => t('張遼殿。あの時の真心、それがしは忘れておらぬ。', 'Zhang Liao. I have not forgotten your sincerity back then.')),
    P(1003, () => t('社長、二人で守れば、どんな持ち場も崩れませぬ。', 'Chief, with the two of us guarding, no post will fall.')),
  ],
  brothers: [
    P(2001, () => t('やあ、グリムさんたちも兄弟なんだね！ 僕たちもさ。', 'Hey, you Grimms are brothers too! So are we.')),
    P(2005, () => t('（兄）兄弟の仕事は記録が二倍。（弟）楽しさも二倍です。', '(Elder) Brothers keep twice the records. (Younger) And have twice the fun.')),
    P(2001, () => t('社長、兄弟ふた組で、試作と記録を分けて回そう！', 'Chief, two sets of brothers: one builds, one records!')),
  ],
};
