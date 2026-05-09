import { JSX } from "react";

function tokenize(s: string): string[] {
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) return [];
    const tokens = s
        .split(/(\s+|[.,!?;:\-—()"'“”„«»…])/)
        .filter((t) => t !== undefined && t !== null && t !== '');
    return tokens.filter((t) => t.trim().length > 0 || t === ' ');
}

// Longest Common Subsequence
function lcs(a: string[], b: string[]) {
    const n = a.length,
        m = b.length;
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            if (a[i] === b[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
            else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    let i = 0,
        j = 0;
    const matchesB2A: number[][] = [];
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            matchesB2A.push([j, i]);
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
        else j++;
    }
    return matchesB2A;
}

export const highlightDifferences = (original: string, recognized: string) => {
    const originalTokens = tokenize(original);
    const recognizedTokens = tokenize(recognized);

    // LCS 找出匹配关系
    const matchesR2O = lcs(originalTokens, recognizedTokens);
    // 构建 recIdx -> oriIdx 的映射
    const matchMapR2O = new Map<number, number>(matchesR2O.map((v) => [v[0], v[1]]));

    const result: JSX.Element[] = [];
    let lastPosO = 0;
    let diffPartR = "";
    let diffPartO = "";
    for (let rIdx = 0; rIdx < recognizedTokens.length; rIdx++) {
        const oIdx = matchMapR2O.get(rIdx);

        if (oIdx === undefined) {
            // 在 original 中不存在
            diffPartR += recognizedTokens[rIdx];
        } else {
            if (oIdx > lastPosO) {
                // 在 original 中存在，但是中间有漏掉的
                for (let i = lastPosO; i < oIdx; i++) {
                    diffPartO += originalTokens[i];
                }
            }

            if (/^\s+$/.test(recognizedTokens[rIdx]) && (!!diffPartR || !!diffPartO)) {
                diffPartR += recognizedTokens[rIdx];
            } else {
                if (!!diffPartR) {
                    if (!!diffPartO) {
                        result.push(
                            <span
                                key={`unmatch-${rIdx}`}
                                title={diffPartO}
                                className="whitespace-pre-wrap bg-red-200 rounded"
                            >
                                {diffPartR}
                            </span>
                        );
                    } else {
                        result.push(
                            <span
                                key={`redundant-${rIdx}`}
                                title="redundant"
                                className="whitespace-pre-wrap bg-red-200 rounded"
                            >
                                {diffPartR}
                            </span>
                        );
                    }
                } else {
                    if (!!diffPartO) {
                        result.push(
                            <span
                                key={`missing-${rIdx}`}
                                title={`missing: ${diffPartO}`}
                                className="whitespace-pre-wrap bg-red-200 rounded"
                            >
                                {"      "}
                            </span>
                        );
                    }
                }

                diffPartR = "";
                diffPartO = "";

                result.push(
                    <span key={`match-${rIdx}`}>{recognizedTokens[rIdx]}</span>
                );
            }

            lastPosO = oIdx + 1;
        }
    }

    // original 剩余多出来的部分
    for (let i = lastPosO; i < originalTokens.length; i++) {
        diffPartO += originalTokens[i];
    }

    if (!!diffPartR) {
        if (!!diffPartO) {
            result.push(
                <span
                    key={`unmatch-end`}
                    title={diffPartO}
                    className="whitespace-pre-wrap bg-red-200 rounded"
                >
                    {diffPartR}
                </span>
            );
        } else {
            result.push(
                <span
                    key={`redundant-end`}
                    title="redundant"
                    className="whitespace-pre-wrap bg-red-200 rounded"
                >
                    {diffPartR}
                </span>
            );
        }
    } else {
        if (!!diffPartO) {
            result.push(
                <span
                    key={`missing-end`}
                    title={diffPartO}
                    className="whitespace-pre-wrap bg-red-200 rounded"
                >
                    {"      "}
                </span>
            );
        }
    }

    return result;
}