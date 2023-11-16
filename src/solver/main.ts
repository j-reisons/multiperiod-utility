import { NdArray } from "ndarray";
import unpack from "ndarray-unpack";
import { Strategy } from "../input/state";
import { TransitionTensor } from "./core";
import { computeTransitionTensor, extendWealthBins, replaceUnknownStrategies } from "./transform";
import { zerosND } from "./utils";
// import { solveCoreGPU } from "./coreGPU";
import { solveCoreCPU } from "./coreCPU";

export interface Problem {
    readonly wealthBoundaries: number[],
    readonly wealthValues: number[],
    readonly wealthStep: number,
    readonly periods: number,
    readonly strategies: Strategy[]
    readonly cashflows: number[],
    readonly utilityFunction: (w: number) => number,
}

export interface Solution {
    readonly optimalStrategies: number[][];
    readonly expectedUtilities: number[][];
    extendedSolution: TrajectoriesInputs | null;
}

export interface TrajectoriesInputs {
    readonly boundaries: number[];
    readonly values: number[];
    readonly optimalTransitionTensor: OptimalTransitionTensor;
}

// A tensor of dimensions (periods, next_wealth, starting_wealth)
// Contains transition probabilities from starting_wealth to next_wealth for the optimal strategy
export interface OptimalTransitionTensor {
    // (periods, next_wealth, starting_wealth)
    values: NdArray;
    // (periods, starting_wealth)
    supportBandIndices: NdArray;
}

export async function solve(problem: Problem): Promise<Solution> {
    const { boundaries, values, originalRange } = extendWealthBins(problem);

    const finalUtilities = values.map(problem.utilityFunction);
    finalUtilities[0] = 0;

    const transitionTensor = computeTransitionTensor(problem.periods, boundaries, values, problem.strategies.map(s => s.CDF), problem.strategies.map(s => s.support), problem.cashflows);

    const coreSolution = await solveCoreCPU({ transitionTensor, finalUtilities });

    const { optimalStrategies, expectedUtilities } = coreSolution;

    replaceUnknownStrategies(optimalStrategies);

    // Recover original bins from the extended ones
    const clippedStrategies = optimalStrategies.hi(-1, originalRange[1]).lo(-1, originalRange[0]).transpose(1, 0);
    const clippedExpectedUtilities = expectedUtilities.hi(-1, originalRange[1]).lo(-1, originalRange[0]).transpose(1, 0);

    return {
        optimalStrategies: unpack(clippedStrategies) as number[][],
        expectedUtilities: unpack(clippedExpectedUtilities) as number[][],
        extendedSolution:
        {
            boundaries: boundaries,
            values: values,
            optimalTransitionTensor: indexOptimalTransitionTensor(transitionTensor, optimalStrategies)
        },
    }
}

function indexOptimalTransitionTensor(transitionTensor: TransitionTensor,
    optimalStrategies: NdArray): OptimalTransitionTensor {
    const periods = optimalStrategies.shape[0];
    const wealthIndexSize = optimalStrategies.shape[1];

    const values = zerosND([periods, wealthIndexSize, wealthIndexSize]);
    const supportBandIndices = zerosND([periods, wealthIndexSize, 2]);

    for (let p = 0; p < periods; p++) {
        const u = transitionTensor.uniquePeriodIndices[p];
        for (let i = 0; i < wealthIndexSize; i++) {
            const strategyIndex = optimalStrategies.get(p, i) > 0 ? optimalStrategies.get(p, i) : 0;
            const bottom = transitionTensor.supportBandIndices[u].get(i, strategyIndex);
            const bandWidth = transitionTensor.supportBandWidths[u].get(i, strategyIndex)
            supportBandIndices.set(p, i, 0, bottom);
            supportBandIndices.set(p, i, 1, bottom + bandWidth);
            for (let j = 0; j < bandWidth; j++) {
                values.set(p, bottom + j, i, transitionTensor.values[u].get(i, strategyIndex, j));
            }
        }
    }

    return { values, supportBandIndices };
}
