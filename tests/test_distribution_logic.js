// Mocking the logic instead of full API integration test for speed/simplicity
// duplicating logic to verify algorithm correctness first
function simulateDistribution(playerCount) {
    const baseCount = Math.floor(playerCount / 3);
    const attributes = [];
    for (let i = 0; i < baseCount; i++) {
        attributes.push('木');
        attributes.push('水');
        attributes.push('火');
    }
    const thunderCount = playerCount - attributes.length;
    for (let i = 0; i < thunderCount; i++) {
        attributes.push('雷');
    }

    // Shuffle
    for (let i = attributes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [attributes[i], attributes[j]] = [attributes[j], attributes[i]];
    }

    return attributes;
}

function verifyCounts(attributes, playerCount) {
    const counts = attributes.reduce((acc, curr) => {
        acc[curr] = (acc[curr] || 0) + 1;
        return acc;
    }, {});

    console.log(`[${playerCount} Players] Distribution:`, counts);

    const base = Math.floor(playerCount / 3);
    const thunderExpected = playerCount - (3 * base);

    let valid = true;
    if ((counts['木'] || 0) !== base) valid = false;
    if ((counts['水'] || 0) !== base) valid = false;
    if ((counts['火'] || 0) !== base) valid = false;
    // Thunder can be base + remainder if base was 0? No, logic is explicit.
    // Thunder is remainder only? No, logic says "Excess to Thunder" implying remainder
    // The user said: "Average distribution (Wood/Water/Fire), extra parts set to Thunder".
    // "多了的部分" = remainder.
    // So if 4 players: 1W, 1F, 1Water. Remainder 1 -> Thunder.
    // If 5 players: 1W, 1F, 1Water. Remainder 2 -> 2 Thunder.

    if ((counts['雷'] || 0) !== thunderExpected) valid = false;

    return valid;
}

// Test Cases
const cases = [3, 4, 5, 6, 7, 10];
let allPass = true;
cases.forEach(n => {
    const attrs = simulateDistribution(n);
    const pass = verifyCounts(attrs, n);
    if (!pass) {
        console.error(`FAILED for N=${n}`);
        allPass = false;
    } else {
        console.log(`PASS for N=${n}`);
    }
});

if (allPass) console.log("Algorithm Logic Verified.");
