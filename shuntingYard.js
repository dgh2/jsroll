function asString(argument) {
	let string = "";
    if (Array.isArray(argument)) {
        string += "[" + argument.map(asString).join(",") + "]";
    } else {
    	string += "" + argument;
    }
    return string;
}

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
        operators.push(Operator.createFunctionOperator("SUM", ShuntingYard.sum));
        operators.push(Operator.createBinaryOperator("<", 3, ShuntingYard.lt));
        operators.push(Operator.createBinaryOperator("<=", 3, ShuntingYard.lte));
        operators.push(Operator.createBinaryOperator(">", 3, ShuntingYard.gt));
        operators.push(Operator.createBinaryOperator(">=", 3, ShuntingYard.gte));
        operators.push(Operator.createBinaryOperator("=", 3, ShuntingYard.eq));
        operators.push(Operator.createBinaryOperator("==", 3, ShuntingYard.eq));
        operators.push(Operator.createUnaryPrefixOperator("d", ShuntingYard.unaryDiceRoll, true));
        operators.push(Operator.createBinaryOperator("d", 2, ShuntingYard.diceRoll, true));
        operators.push(Operator.createUnaryPrefixOperator("[d]", ShuntingYard.arrayUnaryDiceRoll, true));
        operators.push(Operator.createBinaryOperator("[d]", 2, ShuntingYard.arrayDiceRoll, true));

        //test operations
        operators.push(Operator.createBinaryOperator("!", 3, ShuntingYard.append));
        operators.push(Operator.createFunctionOperator("Σ", ShuntingYard.sum));

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
        tokens = tokens.map(token => isNaN(Number(token)) ? token : Number(token)); //convert numeric strings to numbers
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
        const unaryPrefixes = [null,"(","[",","].concat(this.operators.filter(op => op.precedence !== 0));
        let postfix = [];
        let operatorStack = [];
        let groupCounts = [0];
        let groupOperatorCounts = [0];
        let previousToken = null;
        for (let i = 0; i < infix.length; i++) {
            const token = infix[i];
            const expectUnary = unaryPrefixes.includes(i === 0 ? null : previousToken);
            const operator = this.getOperator(token, expectUnary);
            //alert(token + " (" + i + ") " + expectUnary);
            if (i > 0) {
                //alert(infix[i-1] + " (" + (i-1) + ") groupCounts: " + asString(groupCounts));
                //alert(infix[i-1] + " (" + (i-1) + ") groupOperatorCounts: " + asString(groupOperatorCounts));
            }
            if (["(","["].includes(token)) {
            	if (!expectUnary) {
                	throw new Error("Unexpected grouping operator: " + token);
                }
                operatorStack.push(token);
                if (groupCounts[groupCounts.length-1] == 0) {
                	groupCounts[groupCounts.length-1]++; //only count the first operand/group added to a group, additional operands require commas
                }
                groupCounts.push(0);
                groupOperatorCounts.push(0);
            } else if ([")","]"].includes(token)) {
            	let opening = (token === ")" ? "(" : "[");
                while (operatorStack.length && operatorStack[operatorStack.length-1] !== opening) {
                    if (groupOperatorCounts[groupOperatorCounts.length-1] > 0) {
                        groupOperatorCounts[groupOperatorCounts.length-1]--;
                    } else {
                        throw new Error("1 Too few operands provided for operator: " + operatorStack[operatorStack.length-1]);
                    }
                    postfix.push(operatorStack.pop());
                }
                if (groupOperatorCounts[groupOperatorCounts.length-1] > 0) {
                    throw new Error("1.5 Too few operands provided for operator: " + operatorStack[operatorStack.length-1]);
                }
            	if (groupCounts.length === 1) {
                	throw new Error("Mismatched grouping operator: " + token);
                }
            	if (previousToken instanceof Operator && previousToken.fix !== Operator.postfix) {
                	throw new Error("Unexpected grouping operator: " + token);
                }
                operatorStack.pop();
                groupOperatorCounts.pop();
                postfix.push(opening + groupCounts.pop() + token);
                if (token === ")") { //if a set of parenthesis was just closed, check for a preceeding function call
                    if (operatorStack.length && typeof operatorStack[operatorStack.length-1].arity === 'undefined') {
                        if (groupOperatorCounts[groupOperatorCounts.length-1] > 0) {
                            groupOperatorCounts[groupOperatorCounts.length-1]--;
                        } else {
                            throw new Error("1.75 Too few operands provided for operator: " + operatorStack[operatorStack.length-1]);
                        }
                        postfix.push(operatorStack.pop());
                    }
                }
            } else if (token === ",") {
                while (operatorStack.length && !["(","[",","].includes(operatorStack[operatorStack.length-1])) {
                    if (groupOperatorCounts[groupOperatorCounts.length-1] > 0) {
                        groupOperatorCounts[groupOperatorCounts.length-1]--;
                    } else {
                        throw new Error("3 Too few operands provided for operator: " + operatorStack[operatorStack.length-1]);
                    }
                    postfix.push(operatorStack.pop());
                }
            	if (expectUnary || groupCounts.length === 1 || groupCounts[groupCounts.length-1] === 0) {
                	throw new Error("Unexpected grouping operator: " + token);
                }
                groupCounts[groupCounts.length-1]++; //expect another operand
            } else if (operator) {
                while (operatorStack.length && 
                       !["(","[",","].includes(operatorStack[operatorStack.length-1]) &&
                       (operatorStack[operatorStack.length-1].precedence < operator.precedence ||
                        (!operator.rightAssociative && operatorStack[operatorStack.length-1].precedence === operator.precedence))) {
                    if (groupOperatorCounts[groupOperatorCounts.length-1] > 0) {
                        groupOperatorCounts[groupOperatorCounts.length-1]--;
                    } else {
                        throw new Error("4 Too few operands provided for operator: " + operatorStack[operatorStack.length-1]);
                    }
                    postfix.push(operatorStack.pop());
                }
                operatorStack.push(operator);
                groupOperatorCounts[groupOperatorCounts.length-1]++;
            } else {
            	if (!expectUnary) {
                	throw new Error("Unexpected operand: " + token);
                }
                postfix.push(token);
                if (groupCounts[groupCounts.length-1] == 0) {
                	groupCounts[groupCounts.length-1]++; //only count the first operand/group added to a group, additional operands require commas
                }
            }
            previousToken = operator ? operator : token;
        }
        //alert(infix[infix.length-1] + " (" + (infix.length-1) + ") groupCounts: " + asString(groupCounts));
        //alert(infix[infix.length-1] + " (" + (infix.length-1) + ") groupOperatorCounts: " + asString(groupOperatorCounts));
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
        let groupLength = 0;
        let operands = [];
        for (let i = 0; i < postfix.length; i++) {
            if (groupLength > 1 && 
                (!(postfix[i] instanceof Operator) || typeof postfix[i].arity !== 'undefined')) {
                let operandList = operands.slice(-groupLength);
            	throw new Error("Missing function call for operands: " + asString(operandList).slice(1,-1));
            }
            groupLength = 0;
            if (postfix[i] instanceof Operator) {
            	let operator = postfix[i];
            	if (operator.arity !== 0) {
                    if (typeof operator.arity === 'undefined') {
                        let operandList = operands.splice(-groupLength);
                        operands.push(operator.operation(...operandList));
                    } else {
                        if (operands.length < operator.arity) {
                            throw new Error("Too few operands provided for operator: " + operator.token);
                        }
                        let operandList = operands.splice(-operator.arity);
                        operands.push(operator.operation(...operandList));
                    }
                } else {
                	operands.push(operator.operation());
                }
            } else if (Object.prototype.toString.call(postfix[i]) === '[object String]' &&
                       postfix[i].startsWith("(")) {
            	let count = Number(postfix[i].slice(1, -1));
                if (count > operands.length) {
                	throw new Error("Mismatched grouping operator: ,");
                }
                groupLength = count;
            } else if (Object.prototype.toString.call(postfix[i]) === '[object String]' &&
                       postfix[i].startsWith("[")) {
            	let count = Number(postfix[i].slice(1, -1));
                if (count > operands.length) {
                	throw new Error("Mismatched grouping operator: ,");
                }
                let operandList = operands.splice(-count);
            	operands.push(operandList);
            } else {
                operands.push(postfix[i]);
            }
        }
        if (groupLength > 1) {
            let operandList = operands.splice(-groupLength);
            throw new Error("Missing function call for operands: " + asString(operandList).slice(1,-1));
        }
        if (operands.length > 1) {
            throw new Error("Too few operators provided for operands: " + asString(operands).slice(1,-1));
        }
        if (operands.length == 0) {
        	return "";
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
        return ShuntingYard.multiply(1, operand);
    }

    static unaryMinus(operand) {
        if (Array.isArray(operand)) {
            return operand.map(ShuntingYard.unaryMinus);
        }
        return ShuntingYard.multiply(-1, operand);
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
        if (Array.isArray(addend)) {
            return addend.map(value => ShuntingYard.plus(augend, value));
        }
        if (Array.isArray(augend)) {
            return augend.map(value => ShuntingYard.plus(value, addend));
        }
        return augend + addend;
    }

    static minus(minuend, subtrahend) {
        //[5,6,7] - 4 = [1,2,3]
        //[5,2,3] - [4] = [1,2,3]
        //[5,7,9] - [4,5,6] = [1,2,3]
        //[5,7,9,7,8,9] - [4,5,6,7,8,9] = [1,2,3,0,0,0]
        if (Array.isArray(subtrahend)) {
            return subtrahend.map(value => ShuntingYard.minus(minuend, value));
        }
        if (Array.isArray(minuend)) {
            return minuend.map(value => ShuntingYard.minus(value, subtrahend));
        }
        return minuend - subtrahend;
    }

    static multiply(multiplier, multiplicand) {
        if (Array.isArray(multiplicand)) {
            return multiplicand.map(value => ShuntingYard.multiply(multiplier, value));
        }
        if (Array.isArray(multiplier)) {
            return multiplier.map(value => ShuntingYard.multiply(value, multiplicand));
        }
        return multiplier * multiplicand;
    }

    static divide(dividend, divisor) {
        if (Array.isArray(divisor)) {
            return divisor.map(value => ShuntingYard.divide(dividend, value));
        }
        if (Array.isArray(dividend)) {
            return dividend.map(value => ShuntingYard.divide(value, divisor));
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
        if (operand < 0) {
            return undefined;
        }
        if (operand <= 1) {
            return 1;
        }
        return ShuntingYard.multiply(operand, ShuntingYard.factorial(operand - 1));
    }
    
    static sum(...summands) {
    	let sum = 0;
        for (let i = 0; i < summands.length; i++) {
        	sum = ShuntingYard.plus(sum, summands[i]);
        }
        return sum;
    }
    
    static lt(operand1, operand2) {
        if (Array.isArray(operand2)) {
            return operand2.map(value => ShuntingYard.lt(operand1, value));
        }
        if (Array.isArray(operand1)) {
            return operand1.map(value => ShuntingYard.lt(value, operand2));
        }
        return operand1 < operand2;
    }
    
    static lte(operand1, operand2) {
        if (Array.isArray(operand2)) {
            return operand2.map(value => ShuntingYard.lte(operand1, value));
        }
        if (Array.isArray(operand1)) {
            return operand1.map(value => ShuntingYard.lte(value, operand2));
        }
        return operand1 <= operand2;
    }
    
    static gt(operand1, operand2) {
        if (Array.isArray(operand2)) {
            return operand2.map(value => ShuntingYard.gt(operand1, value));
        }
        if (Array.isArray(operand1)) {
            return operand1.map(value => ShuntingYard.gt(value, operand2));
        }
        return operand1 > operand2;
    }
    
    static gte(operand1, operand2) {
        if (Array.isArray(operand2)) {
            return operand2.map(value => ShuntingYard.gte(operand1, value));
        }
        if (Array.isArray(operand1)) {
            return operand1.map(value => ShuntingYard.gte(value, operand2));
        }
        return operand1 >= operand2;
    }
    
    static eq(operand1, operand2) {
        if (Array.isArray(operand2)) {
            return operand2.map(value => ShuntingYard.eq(operand1, value));
        }
        if (Array.isArray(operand1)) {
            return operand1.map(value => ShuntingYard.eq(value, operand2));
        }
        return operand1 == operand2;
    }
    
    static unaryDiceRoll(sides) {
    	return ShuntingYard.diceRoll(1,sides);
    }

    static diceRoll(quantity, sides) {
        if (!Array.isArray(sides)) {
        	if (isNaN(Number(sides))) {
            	throw new Exception("Invalid sides for a dice roll: " + asString(sides));
            }
            sides = [...Array(sides).keys()].map(num => num + 1);
        }
        if (Array.isArray(quantity)) {
            return quantity.map(function(q) {
            	return ShuntingYard.diceRoll(q, sides); 
            });
        }
        let roll = Math.floor(Math.random() * sides.length);
        return ShuntingYard.multiply(quantity, sides[roll]);
    }
    
    static arrayUnaryDiceRoll(sides) {
    	return [ShuntingYard.unaryDiceRoll(sides)];
    }
    
    static arrayDiceRoll(quantity, sides) {
        if (Array.isArray(sides)) {
            return sides.map(value => ShuntingYard.arrayDiceRoll(quantity, value));
        }
        if (Array.isArray(quantity)) {
            return quantity.map(value => ShuntingYard.arrayDiceRoll(value, sides));
        }
        return ShuntingYard.diceRoll(Array(quantity).fill(1), sides);
    }
}
