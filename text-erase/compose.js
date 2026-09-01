const Jimp = require('jimp');
const fs = require('fs');
(async () => {
  const dir = 'H:/workspace/挂机游戏/layers';
  const W = 1152, H = 2048;
  const canvas = new Jimp(W, H, 0x00000000);
  // 背景: 用 output.png 的星空做底(先复制整张,素材盖在上面)
  const bg = await Jimp.read('output.png');
  canvas.composite(bg, 0, 0);
  const get = (n) => dir + '/' + fs.readdirSync(dir).find(f => f.startsWith(n + ' -'));
  const place = async (n, x, y, w, h) => {
    const img = await Jimp.read(get(n));
    img.resize(w, h);
    canvas.composite(img, x, y);
    console.log('placed', n, 'at', x, y, w+'x'+h);
  };
  // 顶部横幅(28)
  await place(28, 0, 0, 1152, 71);
  // 皇冠装饰(0) 标题上方
  await place(0, 500, 40, 102, 106);
  // 资源图标(1,2,3)
  await place(1, 100, 150, 62, 62);
  await place(2, 265, 150, 62, 62);
  await place(3, 450, 150, 62, 62);
  // 按钮条(10-15) 六按钮
  await place(10, 95, 232, 80, 58);
  await place(11, 270, 232, 80, 58);
  await place(12, 455, 232, 80, 58);
  await place(13, 628, 232, 152, 58);
  await place(14, 843, 232, 95, 58);
  await place(15, 1030, 232, 92, 58);
  // 关卡标签(16)
  await place(16, 35, 300, 525, 45);
  // 按钮图标(4-9) 覆盖在按钮条上? 跳过(按钮条自带图标)
  // 关卡卡(18-23,24)
  const rows = [378, 580, 760, 945, 1130, 1315, 1500];
  const cards = [18,19,20,21,22,23,24];
  for (let i = 0; i < 7; i++) await place(cards[i], 180, rows[i], 480, 104);
  // 无限关按钮(17)
  await place(17, 435, 1660, 315, 66);
  // 武器卡片(25,26,27)
  await place(25, 115, 1797, 235, 93);
  await place(26, 472, 1797, 235, 93);
  await place(27, 852, 1797, 235, 93);
  await canvas.writeAsync('composed.png');
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
