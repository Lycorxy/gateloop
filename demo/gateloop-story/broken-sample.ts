// 故意埋三类问题：TS 类型错误 + ESLint 违规 + Prettier 格式违规
// （真实事故复现 demo，GateLoop 门禁将逐一拦截）
export function calcTotal(items: { price: number; count: number }[]) {
    let total: number = 0
    for (const it of items) {
        total = total + it.price * it.count
    }
    return total
}
