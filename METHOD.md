# Method and assumptions

## Design

The roster contains N actual randomization units, partitioned into fixed blocks. Block b has n_b units and a prespecified m_b assigned to B, with 1 ≤ m_b < n_b. The reference design gives equal probability to every product of within-block subsets. Its size is K = product_b choose(n_b, m_b).

The point estimate is T = sum_b (n_b/N) × (mean_B,b − mean_A,b). It is not the pooled difference when allocation fractions vary. Athey and Imbens describe this design-based, within-stratum comparison and the importance of the assignment mechanism: [The Econometrics of Randomized Experiments](https://arxiv.org/abs/1607.00698).

The file cannot verify actual assignment, compliance, absence of interference, suitable units or representativeness. Rows must be the units that were randomized. If clusters were assigned, entering their members as independently randomized rows is invalid.

## Allocation record

For each block, Fisher–Yates shuffles its unit positions and assigns the first m_b to B. A single continuing word source is used across all blocks. For a bounded choice of size s, accept a uint32 word w only when w < floor(2^32/s) × s, then return w mod s. This avoids modulo bias under the uniform-word model. See Lemire, [Fast Random Integer Generation in an Interval](https://arxiv.org/abs/1805.10941).

The visible allocation action obtains words from browser Web Crypto. Every consumed word, including rejections, is recorded alongside the ordered roster, blocks, counts and fy-u32-v1 algorithm. Import replays the transcript and rejects a mismatch, extra words or an incomplete record. This is consistency, not proof of genuine randomness or field procedure. Anyone can edit a file; exporting it exposes allocation and is not blinding.

Reassignment requires explicit reset to an unassigned roster, which clears the old assignment and outcomes. This workflow safeguard is not tamper resistance.

## Sharp null and tail convention

For a hypothesized constant effect τ, define adjusted outcomes Y_i − τZ_obs,i. The null asserts the same additive effect for every unit. For each admissible assignment z, compute T(z, Y − τZ_obs). Count it as extreme when its absolute value is at least the absolute observed adjusted statistic. Ties are included. This is an absolute-tail test, not automatically twice a one-sided tail.

With full enumeration, p = extreme/K; the observed assignment is already in K. With simulation, p = (extreme + 1)/(M + 1), M = 10,000, with the added observed allocation. Draws are with replacement; duplicates are retained. The principle of including the observed case, and the role of the transformation design, are discussed by Hemerik and Goeman in [Exact testing with random permutations](https://link.springer.com/article/10.1007/s11749-017-0571-1). Do not interpret p as the chance the hypothesis is true.

## Exact arithmetic

Accepted outcomes and τ are decimal strings with at most six fractional places, represented as integer millionths. Statistics, inclusive comparisons, interval roots and sorting use BigInt rational arithmetic. Approximate numbers are used only for plot coordinates and display. Report fractions preserve exact numerator/denominator strings; displayed values use six significant digits.

Let L be the least common multiple of m_b(n_b−m_b), D = N L, and q_b = n_b L/[m_b(n_b−m_b)]. For an assignment z, the integer statistic numerator is:

    a_num = sum_b q_b [n_b sum_{i in B(z,b)} Y_micro,i − m_b sum_{i in b} Y_micro,i]

The statistic is a_num/(D×10^6). Let t_num be its observed counterpart and let overlap_b count units in both the proposed and observed B sets. Then:

    b_num = sum_b q_b [n_b overlap_b − m_b²]

The adjusted comparison is exactly |a_num − b_num τ_micro| ≥ |t_num − D τ_micro|.

## Algebraic interval inversion

This implementation's derivation is specific to the statistic above. In real units write a = T(z,Y), b = T(z,Z_obs), t = T_obs. Then −1 ≤ b ≤ 1 and the extreme condition is:

    |a − bτ| ≥ |t − τ|

For |b| < 1 it holds on the closed interval between (t−a)/(1−b) and (t+a)/(1+b). Every such interval contains t. The observed assignment contributes all real numbers; its complement does too when every block is balanced. These universal cases are recognized exactly and checked against their numerator invariants.

For confidence c, let α = 1−c. Acceptance uses p(τ) > α, consistent with rejection at p ≤ α. Set R = floor(αK)+1. The confidence set is the Rth smallest lower endpoint through the Rth largest upper endpoint, inclusive. For Monte Carlo, use the same sampled bank, append one universal observed interval, and replace K with M+1. Infinite ends are represented as null bounds and labelled −∞/+∞. No candidate grid, root search or floating tolerance is used.

This interval assumes a common additive effect. It is not generally a heterogeneous average-treatment-effect interval. The distinction between sharp common-effect inference and broader effect claims matters; see Caughey et al., [Randomisation inference beyond the sharp null](https://academic.oup.com/jrsssb/article/85/5/1471/7246293).

## Monte Carlo reproducibility

For K > 50,000, a separate PCG-XSH-RR 64/32 sequence supplies bounded choices using the same rejection/Fisher–Yates rules. The seed is a uint32; stream selector 54 corresponds to increment 109. Initialization: zero state, advance once, add seed modulo 2^64, advance once. State multiplier: 6364136223846793005. One continuing stream spans all blocks and all 10,000 draws.

The implementation is checked against the [official PCG demo sequence](https://www.pcg-random.org/using-pcg-c-basic.html). The same seed and same ordered study yield the same allocation bank at every τ and confidence level. The deterministic sequence approximates ideal uniform sampling; formal sampling-based guarantees assume the corresponding ideal construction. Do not call it 10,000 genuinely independent physical random draws or full enumeration. Do not search seeds, stop early or deduplicate.

## Missingness and selection

Blank outcomes block analysis. No unit or block is silently discarded and zero is never treated as missing. Missing-data handling requires additional justification outside this release; see Heng, Zhang and Feng, [Design-Based Causal Inference with Missing Outcomes](https://arxiv.org/abs/2310.18556).

The interface supports one declared comparison, not protection against repeated optional testing, multiple outcomes, selective reporting or post-outcome design choices. The editable protocol note is not an immutable preregistration.
