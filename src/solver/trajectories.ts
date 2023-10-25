import { Matrix, zeros } from "mathjs";
import { ExtendedSolution } from "./main";


export function computeTrajectories(extendedSolution: ExtendedSolution, periodIndex: number, wealthIndex: number): Matrix {
    const optimalTransitionTensor = extendedSolution.extendedOptimalTransitionTensor;
    const periods = optimalTransitionTensor.length;
    const wealthIndexSize = optimalTransitionTensor[0].size()[0];
    // Set-up the distribution and propagate it forward
    const trajectories = zeros([periods + 1, wealthIndexSize], 'dense') as Matrix;
    const shiftedWealthindex = extendedSolution.originalRange.get([0]) + wealthIndex;
    const trajectoriesArray = trajectories.valueOf() as number[][];
    trajectoriesArray[periodIndex][shiftedWealthindex] = 1.0;

    for (let p = periodIndex; p < periods; p++) {
        const transitionMatrixArray = optimalTransitionTensor[p].valueOf() as number[][];
        for (let i = 0; i < wealthIndexSize; i++) {
            for (let j = 0; j < wealthIndexSize; j++) {
                trajectoriesArray[p + 1][i] += trajectoriesArray[p][j] * transitionMatrixArray[i][j];
            }
        }
    }
    return trajectories;
}

export interface QuantileTraces {
    readonly probability: number
    readonly x: number[]
    readonly y_bottom: number[]
    readonly y_top: number[]
}

export function findQuantiles(trajectories: Matrix, probabilities: number[], startPeriod: number): QuantileTraces[] {
    const sortedProbabilities = probabilities.slice().sort().reverse();
    const sortedTails = sortedProbabilities.map(p => (1 - p) / 2.0);
    const trajectoriesArray = trajectories.toArray() as number[][];

    const x = new Array<number>(trajectoriesArray.length - startPeriod);
    const y_bottom = zeros([probabilities.length, trajectoriesArray.length - startPeriod]).valueOf() as number[][];
    const y_top = zeros([probabilities.length, trajectoriesArray.length - startPeriod]).valueOf() as number[][];

    for (let p = 0; p < trajectoriesArray.length - startPeriod; p++) {
        x[p] = startPeriod + p;
        const periodDistribution = trajectoriesArray[startPeriod + p];

        let sum = 0;
        let w = 0;
        for (let i = 0; i < probabilities.length; i++) {
            while (sum < sortedTails[i] && w < periodDistribution.length) {
                sum += periodDistribution[w++];
            }
            y_bottom[i][p] = w;
        }

        sum = 0;
        w = periodDistribution.length - 1;
        for (let i = 0; i < probabilities.length; i++) {
            while (sum < sortedTails[i] && w > 0) {
                sum += periodDistribution[w--];
            }
            y_top[i][p] = w;
        }
    }

    const result = new Array<QuantileTraces>();
    for (let i = 0; i < probabilities.length; i++) {
        result.push({
            probability: sortedProbabilities[i],
            x: x,
            y_bottom: y_bottom[i],
            y_top: y_top[i]
        })
    }
    return result;
}
