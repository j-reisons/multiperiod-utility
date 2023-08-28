import Plotly from "plotly.js-cartesian-dist";
import React, { useEffect } from 'react';

import { Matrix, evaluate, isMatrix } from "mathjs";
import "./input.css";

export interface CashflowsFormState {
    // Contents of the textarea
    readonly cashflowString: string;
    // Set on blur, reset on focus
    readonly cashflowStringValid: boolean;
    // Updated on blur, if valid
    readonly cashflows: number[];
}

export interface CashflowFormProps {
    state: CashflowsFormState;
    setState: React.Dispatch<React.SetStateAction<CashflowsFormState>>
}

// TODO: explicitly define time range
export const CashflowsForm: React.FC<CashflowFormProps> = ({ state, setState }) => {

    const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setState({
            ...state,
            cashflowString: event.target.value,
        })
    }

    const onFocus = () => {
        setState({
            ...state,
            cashflowStringValid: true,
        })
    }

    const onBlur = () => {
        const arrayOrNull = parseCashflowArray(state.cashflowString);
        if (arrayOrNull == null) {
            setState({
                ...state,
                cashflowStringValid: false,
            })
        } else {
            setState({
                ...state,
                cashflowStringValid: true,
                cashflows: arrayOrNull
            })
        }
    }

    useEffect(() => {

        const data: Plotly.Data[] = [{
            y: state.cashflows,
            type: 'bar'
        }];

        const margin = 30;
        const layout: Partial<Plotly.Layout> = {
            margin: { t: margin, l: margin, r: margin, b: margin }
        }

        Plotly.newPlot('plotting-area-cashflows', data, layout);

        return () => {
            Plotly.purge('plotting-area-cashflows');
        };
    });

    return (
        <div className="container">
            <div className="instructions">
                <div className="title">Cashflows</div>
                Lorem ipsum dolor sit amet</div>
            <textarea className={"input-box"}
                style={!state.cashflowStringValid ? { borderColor: "red" } : {}}
                placeholder="Type some math here"
                onChange={handleInput}
                onFocus={onFocus}
                onBlur={onBlur}
                value={state.cashflowString}>
            </textarea>
            <div id="plotting-area-cashflows">
            </div>
        </div>
    )

}

function parseCashflowArray(cashflowString: string): (number[] | null) {
    // Needed for multiline expressions
    const stripped = cashflowString.replace(/\s/g, '');
    let result;
    try {
        result = evaluate(stripped);
        if (isMatrix(result) && result.size().length === 1) {
            return (result as Matrix).toArray() as number[];
        }
        return null;
    }
    catch (error) {
        return null;
    }
}