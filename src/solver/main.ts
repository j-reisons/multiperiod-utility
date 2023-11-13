import { NdArray } from "ndarray";
import unpack from "ndarray-unpack";
import { Strategy } from "../input/state";
import { TransitionTensor, coreSolveCPU } from "./coreCPU";
import { computeTransitionTensor, extendWealthBins, replaceUnknownStrategies } from "./transform";
import { zerosND } from "./utils";

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
    extendedSolution: ExtendedSolution | null;
}

export interface ExtendedSolution {
    readonly extendedBoundaries: number[];
    readonly extendedValues: number[];
    // (periods, final_wealth, starting_wealth)
    readonly extendedOptimalTransitionTensor: NdArray;
}

export async function solve(problem: Problem): Promise<Solution> {
    const { boundaries, values, originalRange } = extendWealthBins(problem);

    const finalUtilities = values.map(problem.utilityFunction);
    finalUtilities[0] = 0;

    const transitionTensor = computeTransitionTensor(problem.periods, boundaries, values, problem.strategies.map(s => s.CDF), problem.strategies.map(s => s.support), problem.cashflows);

    const coreSolution = coreSolveCPU({ transitionTensor, finalUtilities });

    const { optimalStrategies, expectedUtilities } = coreSolution;

    replaceUnknownStrategies(optimalStrategies);

    // Recover original bins from the extended ones
    const clippedStrategies = optimalStrategies.hi(-1, originalRange[1]).lo(-1, originalRange[0]).transpose(1, 0);
    const unpackedStrategies = unpack(clippedStrategies) as number[][];
    const clippedExpectedUtilities = expectedUtilities.hi(-1, originalRange[1]).lo(-1, originalRange[0]).transpose(1, 0);
    const unpackedUtilities = unpack(clippedExpectedUtilities) as number[][];

    return {
        optimalStrategies: unpackedStrategies,
        expectedUtilities: unpackedUtilities,
        extendedSolution:
        {
            extendedBoundaries: boundaries,
            extendedValues: values,
            extendedOptimalTransitionTensor: indexOptimalTransitionTensor(transitionTensor, optimalStrategies)
        },
    }
}

function indexOptimalTransitionTensor(transitionTensor: TransitionTensor, optimalStrategies: NdArray): NdArray {
    const periods = optimalStrategies.shape[0];
    const wealthIndexSize = optimalStrategies.shape[1];

    const optimalTransitionTensor = zerosND([periods, wealthIndexSize, wealthIndexSize]);
    for (let p = 0; p < periods; p++) {
        for (let i = 0; i < wealthIndexSize; i++) {
            const strategyIndex = optimalStrategies.get(p, i) > 0 ? optimalStrategies.get(p, i) : 0;
            const bottom = transitionTensor.supportBandIndices[p].get(i, strategyIndex, 0);
            const top = transitionTensor.supportBandIndices[p].get(i, strategyIndex, 1);
            for (let j = bottom; j < top; j++) {
                optimalTransitionTensor.set(p, j, i, transitionTensor.values[p].get(i, strategyIndex, j));
            }
        }
    }

    return optimalTransitionTensor;
}
