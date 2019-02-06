//http://reedbeta.com/blog/the-shunting-yard-algorithm/#how-it-works
//https://math.stackexchange.com/questions/975541/what-are-the-formal-names-of-operands-and-results-for-basic-operations

//https://jsfiddle.net/t6Lodhu9/

/*
function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}
*/

class Operator {
    constructor(token, precedence, arity, fix, operation, rightAssociative = false) {
        this.token = token; //the token representing this operation
        this.precedence = precedence; //a value representing this operation in the order of operations
        this.arity = arity; //the number of arguments this operation takes
        this.fix = fix; //if the operator is prefix, infix, or postfix
        this.operation = operation; //the function to run with the given parameters
        this.rightAssociative = rightAssociative; //false if operator is left associative, right otherwise
    }

    toString() {
        return this.token;
    }

    static comparePrecedence(o1, o2) {
        if (!o1.hasOwnProperty("precedence") || !o2.hasOwnProperty("precedence")) {
            throw new TypeError('Cannot compare without precedences.');
        }
        return o1.precedence - o2.precedence;
    }

    static compareLength(o1, o2) {
        if (!o1.hasOwnProperty("token") || !o2.hasOwnProperty("token")) {
            throw new TypeError('Cannot compare without tokens.');
        }
        return o2.token.length - o1.token.length;
    }

    static createConstant(token, operation) { //example: PI = 3.14
        return new this(token, 0, 0, undefined, operation);
    }

    static createUnaryPrefixOperator(token, operation) { //example: unary minus, -5
        return new this(token, 2, 1, this.prefix, operation, true);
    }

    static createBinaryOperator(token, precedence, operation, rightAssociative = false) { //example: addition, 2 + 3
        return new this(token, precedence, 2, this.infix, operation, rightAssociative);
    }

    static createUnaryPostfixOperator(token, operation) { //example: factorial, 3!
        return new this(token, 2, 1, this.postfix, operation, false);
    }

    static createFunctionOperator(token, operation) { //example: MAX
        return new this(token, 2, undefined, this.prefix, operation, true);
    }

    static get prefix() {
        return "prefix";
    }

    static get infix() {
        return "infix";
    }

    static get postfix() {
        return "postfix";
    }
}

class ShuntingYard {
    constructor() {
        let operators = [];

        //standard operations
        operators.push(Operator.createUnaryPrefixOperator("+", ShuntingYard.unaryPlus));
        operators.push(Operator.createUnaryPrefixOperator("-", ShuntingYard.unaryMinus));
        operators.push(Operator.createBinaryOperator("+", 4, ShuntingYard.plus));
        operators.push(Operator.createBinaryOperator("-", 4, ShuntingYard.minus));
        operators.push(Operator.createBinaryOperator("*", 3, ShuntingYard.multiply));
        operators.push(Operator.createBinaryOperator("/", 3, ShuntingYard.divide));

        //special operations
        operators.push(Operator.createConstant("PI", ShuntingYard.PI));
        operators.push(Operator.createUnaryPrefixOperator("!", ShuntingYard.booleanNegate));
        operators.push(Operator.createUnaryPostfixOperator("!", ShuntingYard.factorial));
        operators.push(Operator.createUnaryPostfixOperator("%", ShuntingYard.percent));
        operators.push(Operator.createFunctionOperator("MAX", Math.max));
        operators.push(Operator.createFunctionOperator("MIN", Math.min));
        operators.push(Operator.createUnaryPrefixOperator("d", ShuntingYard.unaryDiceRoll, true));
        operators.push(Operator.createBinaryOperator("d", 2, ShuntingYard.diceRoll, true));
        operators.push(Operator.createFunctionOperator("Σ", ShuntingYard.sum));

        //test operations
        operators.push(Operator.createBinaryOperator("!", 3, ShuntingYard.append));

        //sort by longest tokens first, so operators can be added in any order
        operators.sort(Operator.compareLength);

        this.operators = operators;

        let numberRegex = "(?:(?:\\d*\\.)?\\d+)";
        let stringRegex = "(?:[\"“](?:(?!\\\\).|\\\\.)*?[\"”]|['‘](?:(?!\\\\).|\\\\.)*?['’])";
        let groupingRegex = "(?:\\(|\\)|\\[|\\]|,|\\{|\\}|<|>)";
        let operatorRegex = operators.map(op => ShuntingYard.escapeRegex(op.token)).join("|");
        this.regex = new RegExp("(?:" + stringRegex + "|" + numberRegex + "|" + operatorRegex + "|" + groupingRegex + "| )", "g");
    }

    static escapeRegex(regex) {
        //add escape characters before all regex special characters in the input regex
        return regex.replace(/[-.*+?^${}()|[\]\\\/]/g, '\\$&');
    }

    static process(str) {
        return new ShuntingYard().process(str);
    }

    process(str) {
        return this.evaluate(this.infixToPostfix(this.tokenize(str)));
    }

    tokenize(str) {
        let tokens = str.match(this.regex); //split input into tokens
        if (tokens === null || tokens.join('') !== str) { //something from the input did not end up in tokens
            let unrecognizedTokens = str.replace(this.regex, '\n').split('\n').filter(error => error !== '');
            throw new Error("Unrecognized token: " + unrecognizedTokens[0]);
        }
        tokens = tokens.map(token => token.trim()); //remove spaces before and after each token
        tokens = tokens.filter(token => token !== ''); //remove all empty tokens left by removing spaces
        return tokens;
    }

    getOperator(token, isUnary) {
        let operators = this.operators.filter(op => op.token === token);
        if (operators && operators.length > 1) {
            if (isUnary) {
                operators = operators.filter(op => typeof op.fix === 'undefined' || 
                								(op.fix === Operator.prefix && op.arity === 1));
            } else {
                operators = operators.filter(op => typeof op.fix === 'undefined' || 
                								!(op.fix === Operator.prefix && op.arity === 1));
            }
        }
        if (operators && operators.length) {
            return operators[0];
        }
    }

    infixToPostfix(infix) {
        if (!Array.isArray(infix)) {
            throw new TypeError('Operand must be an array to convert to postfix.');
        } else if (infix.length === 0) {
            return infix;
        }
        const unaryPrefixes = [null,"(","[",","].concat(this.operators.filter(op => op.precedence !== 0).map(op => op.token));
        let postfix = [];
        let operatorStack = [];
        for (let i = 0; i < infix.length; i++) {
            const token = infix[i];
            const expectUnary = unaryPrefixes.includes(i === 0 ? null : infix[i-1]);
            const operator = this.getOperator(token, expectUnary);
            if (token === "(") {
                operatorStack.push(token);
            } else if (token === "[") {
                operatorStack.push(token);
            } else if (token === ")") {
                while (operatorStack.length && operatorStack[operatorStack.length-1] !== "(") {
                    postfix.push(operatorStack.pop());
                }
                if (operatorStack.length === 0) {
                    throw new Error("Mismatched grouping operator: )")
                }
                operatorStack.pop();
                if (operatorStack.length && typeof operatorStack[operatorStack.length-1].arity === 'undefined') {
                	postfix.push(operatorStack.pop());
                }
            } else if (token === "]") {
                while (operatorStack.length && operatorStack[operatorStack.length-1] !== "[") {
                    postfix.push(operatorStack.pop());
                }
                if (operatorStack.length === 0) {
                    throw new Error("Mismatched grouping operator: ]")
                }
                operatorStack.pop();
                postfix.push(token);
            } else if (token === ",") {
                while (operatorStack.length && !["(","[",","].includes(operatorStack[operatorStack.length-1])) {
                    postfix.push(operatorStack.pop());
                }
                if (operatorStack.length === 0) {
                    throw new Error("Mismatched grouping operator: ,");
                }
                postfix.push(token);
            } else if (operator) {
                while (operatorStack.length && 
                       !["(","[",","].includes(operatorStack[operatorStack.length-1]) &&
                       (operatorStack[operatorStack.length-1].precedence < operator.precedence ||
                        (!operator.rightAssociative && operatorStack[operatorStack.length-1].precedence === operator.precedence))) {
                    postfix.push(operatorStack.pop());
                }
                operatorStack.push(operator);
            } else {
                postfix.push(token);
            }
        }
        while (operatorStack.length) {
            postfix.push(operatorStack.pop());
        }
        if (postfix.includes("(")) {
            throw new Error("Mismatched grouping operator: (")
        }
        if (postfix.includes("[")) {
            throw new Error("Mismatched grouping operator: [")
        }
        return postfix;
    }

    evaluate(postfix) {
        if (!Array.isArray(postfix)) {
            throw new TypeError('Operand must be an array to evaluate.');
        } else if (postfix.length === 0) {
            return "";
        }
        let parameters = [];
        let operands = [];
        for (let i = 0; i < postfix.length; i++) {
            if (postfix[i] === ",") {
            	//alert("Moving operand " + operands[operands.length-1] + " to parameters");
                parameters.push(operands.pop());
            } else if (postfix[i] === "]") {
                parameters.push(operands.pop());
            	operands.push(parameters);
                parameters = [];
            } else if (postfix[i] instanceof Operator) {
            	if (postfix[i].arity !== 0) {
                    if (typeof postfix[i].arity === 'undefined') {
                        //alert("Moving operand " + operands[operands.length-1] + " to parameters");
                        parameters.push(operands.pop());
                        //alert("Calling " + postfix[i].token + " with parameters (" + parameters.join(",") + ")");
                        operands.push(postfix[i].operation(...parameters));
                        parameters = [];
                    } else {
                        if (operands.length < postfix[i].arity) {
                        	//alert("Expected " + postfix[i].arity + " operands, got " + operands.length);
                            throw new Error("Too few operands passed to " + postfix[i].token);
                        }
                        let operandList = [];
                        for (let j = 0; j < postfix[i].arity; j++) {
                            //alert("Changing operand " + operands[operands.length-1] + " to parameter");
                            operandList.push(operands.pop());
                        }
                        //alert("Calling " + postfix[i].operation.name + " with operands (" + operandList.join(",") + ")");
                        operands.push(postfix[i].operation(...operandList));
                    }
                } else {
                	//alert("Pushing result of " + postfix[i].operation.name);
                	operands.push(postfix[i].operation());
                }
            } else {
                //alert("Pushing operand: " + postfix[i]);
                operands.push(postfix[i]);
            }
        }
        if (parameters.length) {
            throw new Error("Missing function call for parameters: (" + parameters.join(",") + ")");
        }
        if (operands.length > 1) {
            throw new Error("Too few operators provided! Remaining operands: " + operands.join(","));
        }
        return operands[0];
    }
    
    static PI() {
    	return 3.14;
    }

    static unaryPlus(operand) {
        if (Array.isArray(operand)) {
            return operand.map(ShuntingYard.unaryPlus);
        }
        return ShuntingYard.multiply(operand, 1);
    }

    static unaryMinus(operand) {
        if (Array.isArray(operand)) {
            return operand.map(ShuntingYard.unaryMinus);
        }
        return ShuntingYard.multiply(operand, -1);
    }

    static append() {
        //[1,2,3] . 4 = [1,2,3,4]
        //[1,2,3] . [4] = [1,2,3,4]
        //[1,2,3] . [[4]] = [1,2,3,[4]]
        //[1,2,3] . [4,5,6] = [1,2,3,4,5,6]
        //[1,2,3] . [[4,5,6]] = [1,2,3,[4,5,6]]
        let operand1 = arguments[0];
        let operand2 = arguments[1];
        let result = operand1.slice(0);
        //TODO: handle operand1 that isn't an array
        if (Array.isArray(operand2)) {
            for (let i = 0; i < operand2.length; i++) {
                result.push(operand2[i]);
            }
        } else {
            result.push(operand2);
        }
        return result;
    }

    static plus(augend, addend) {
        //[1,2,3] + 4 = [5,6,7]
        //[1,2,3] + [4] = ([1,2,3] + [4,0,0]) = [5,2,3]
        //[1,2,3] + [4,5,6] = [5,7,9]
        //[1,2,3] + [4,5,6,7,8,9] = ([1,2,3,0,0,0] + [4,5,6,7,8,9]) = [5,7,9,7,8,9]
        if (Array.isArray(augend)) {
            if (!Array.isArray(addend)) {
                return augend.map(value => this.plus(value, addend));
            } else {
                let sum = [];
                for (let i = 0; i < augend.length || i < addend.length; i++) {
                    sum.push(this.plus((augend[i] ? augend[i] : 0), (addend[i] ? addend[i] : 0)));
                }
                return sum;
            }
        }
        return augend + addend;
    }

    static minus(minuend, subtrahend) {
        //[5,6,7] - 4 = [1,2,3]
        //[5,2,3] - [4] = [1,2,3]
        //[5,7,9] - [4,5,6] = [1,2,3]
        //[5,7,9,7,8,9] - [4,5,6,7,8,9] = [1,2,3,0,0,0]
        if (Array.isArray(minuend)) {
            if (!Array.isArray(subtrahend)) {
                return minuend.map(value => this.plus(value, subtrahend));
            } else {
                let difference = [];
                for (let i = 0; i < minuend.length || i < subtrahend.length; i++) {
                    difference.push(this.plus((minuend[i] ? minuend[i] : 0), (subtrahend[i] ? subtrahend[i] : 0)));
                }
                return difference;
            }
        }
        return minuend + subtrahend;
    }

    static multiply(multiplier, multiplicand) {
        if (Array.isArray(multiplier)) {
            if (!Array.isArray(multiplicand)) {
                return multiplier.map(value => this.plus(value, multiplicand));
            } else {
                let product = [];
                for (let i = 0; i < multiplier.length || i < multiplicand.length; i++) {
                    product.push(this.multiply((multiplier[i] ? multiplier[i] : 0), (multiplicand[i] ? multiplicand[i] : 0)));
                }
                return product;
            }
        }
        return multiplier * multiplicand;
    }

    static divide(dividend, divisor) {
        if (Array.isArray(dividend)) {
            if (!Array.isArray(divisor)) {
                return dividend.map(value => this.plus(value, divisor));
            } else {
                let quotient = [];
                for (let i = 0; i < dividend.length || i < divisor.length; i++) {
                    quotient.push(this.multiply((dividend[i] ? dividend[i] : 0), (divisor[i] ? divisor[i] : 0)));
                }
                return quotient;
            }
        }
        return dividend / divisor;
    }

    static booleanNegate(operand) {
        if (Array.isArray(operand)) {
            return operand.map(ShuntingYard.booleanNegate);
        }
        return !operand;
    }

    static factorial(operand) {
    	if (typeof operand === 'undefined' || operand === null) {
        	throw new Error("Factorial requires a parameter");
        }
        if (Array.isArray(operand)) {
            return operand.map(ShuntingYard.factorial);
        }
        if (operand === 0 || operand === 1) {
            return operand;
        }
        if (operand < 0) {
            return undefined;
        }
        return ShuntingYard.multiply(operand, ShuntingYard.factorial(operand - 1));
    }
    
    static unaryDiceRoll(...sides) {
    	return ShuntingYard.diceRoll(1, ...sides);
    }

    static diceRoll(quantity, ...sides) {
        /*if (Array.isArray(quantity)) {
            return quantity.map(function(q) { return ShuntingYard.diceRoll(q, ...sides); });
        }
        if (Array.isArray(sides)) {
            return sides.map(function(s) { return ShuntingYard.diceRoll(quantity, ...s); });
        }*/
        return ShuntingYard.multiply(quantity, Math.max(sides));
    }

    static customDiceRoll(quantity, ...sides) {
        /*if (Array.isArray(quantity)) {
            return quantity.map(function(q) { return ShuntingYard.customDiceRoll(q, ...sides); });
        }
        if (Array.isArray(sides)) {
            return sides.map(function(s) { return ShuntingYard.customDiceRoll(quantity, ...s); });
        }*/
        return ShuntingYard.multiply(quantity, Math.max(sides));
    }
    
    static sum(...summands) {
    	let sum = 0;
        for (let i = 0; i < summands.length; i++) {
        	sum = ShuntingYard.plus(sum, summands[i]);
        }
        return sum;
    }
}
