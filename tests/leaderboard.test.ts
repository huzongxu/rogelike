/**
 * 幻影榜(策划案 V3 §4.3)纯函数验证:
 * 确定性(同赛季恒同榜)、形状(10 条升序)、名次口径(1 + 严格大于数)。
 */

import { describe, it, expect } from "vitest";
import { phantomBoard, rankAmong, PHANTOM_COUNT, type PhantomEntry } from "@game/data/leaderboard";

describe("phantomBoard(§4.3)", () => {
  it("确定性:同 seasonId 两次全等(后端未接入前榜单必须稳定)", () => {
    for (const id of [1, 2, 7, 42]) {
      expect(phantomBoard(id)).toEqual(phantomBoard(id));
    }
  });

  it("不同赛季不同榜(换榜感)", () => {
    const sig = (b: PhantomEntry[]) => b.map((e) => e.score).join(",");
    expect(sig(phantomBoard(1))).not.toBe(sig(phantomBoard(2)));
    expect(sig(phantomBoard(3))).not.toBe(sig(phantomBoard(4)));
  });

  it("形状:10 条、名次 1–10、分数严格降序且为正整数(100 个赛季扫描)", () => {
    for (let id = 1; id <= 100; id++) {
      const b = phantomBoard(id);
      expect(b.length, `season ${id}`).toBe(PHANTOM_COUNT);
      for (let i = 0; i < b.length; i++) {
        expect(b[i].rank, `season ${id} rank`).toBe(i + 1);
        expect(Number.isInteger(b[i].score), `season ${id} 整数分`).toBe(true);
        expect(b[i].score, `season ${id} 正分`).toBeGreaterThan(0);
        if (i > 0) expect(b[i - 1].score, `season ${id} 严格降序`).toBeGreaterThan(b[i].score);
      }
    }
  });

  it("分布区间:新手 1 星首通(10 分)未入榜,顶格留冲榜空间", () => {
    for (let id = 1; id <= 100; id++) {
      const b = phantomBoard(id);
      const lowest = b[b.length - 1].score;
      const highest = b[0].score;
      // 末名 > 10:1 星首通(赛季分 10)不会首局就入榜,避免空榜感
      expect(lowest, `season ${id} 末名下限`).toBeGreaterThan(10);
      // 榜首 ≥ 220:星数近满 + 高波次才有登顶空间
      expect(highest, `season ${id} 榜首上限`).toBeGreaterThanOrEqual(220);
      expect(highest, `season ${id} 榜首不过松`).toBeLessThanOrEqual(280);
    }
  });
});

describe("rankAmong(§4.3)", () => {
  const board = phantomBoard(2);

  it("低于全部幻影 → 11(未入榜)", () => {
    expect(rankAmong(0, board)).toBe(11);
    expect(rankAmong(1, board)).toBe(11);
  });

  it("高于全部幻影 → 1", () => {
    expect(rankAmong(9999, board)).toBe(1);
    expect(rankAmong(board[0].score + 1, board)).toBe(1);
  });

  it("中间插值:名次 = 1 + 严格大于数", () => {
    // 恰好超过末名 → 第 10 名
    expect(rankAmong(board[board.length - 1].score + 1, board)).toBe(10);
    // 恰好低于榜首 → 第 2 名
    expect(rankAmong(board[0].score - 1, board)).toBe(2);
  });

  it("与幽灵同分共享该名次(并列口径)", () => {
    for (const e of board) {
      expect(rankAmong(e.score, board)).toBe(e.rank);
    }
  });

  it("名次变小 = 提升(口径自洽)", () => {
    const before = rankAmong(10, board);
    const after = rankAmong(board[board.length - 1].score + 1, board);
    expect(after).toBeLessThan(before);
  });
});
