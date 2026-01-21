
const attributeRules = { '木': '水', '水': '火', '火': '木' };

function resolveAttack(attacker, target) {
    let attackSuccess = false;

    // Amphibian logic simulation (skipping for this test as we aren't changing it, 
    // but assuming standard logic comes after)

    if (attacker.attribute === target.attribute) {
        // New Rule: Same Attribute = Level High Wins
        console.log(`[SAME ATTR] ${attacker.attribute} vs ${target.attribute}`);
        attackSuccess = attacker.level > target.level;
    } else {
        // Different Attributes
        if (attacker.attribute === '雷' || target.attribute === '雷') {
            console.log(`[THUNDER] ${attacker.attribute} vs ${target.attribute}`);
            attackSuccess = true;
        } else if (attributeRules[attacker.attribute] === target.attribute) {
            console.log(`[ADVANTAGE] ${attacker.attribute} > ${target.attribute}`);
            attackSuccess = true;
        } else if (attributeRules[target.attribute] === attacker.attribute) {
            console.log(`[DISADVANTAGE] ${attacker.attribute} < ${target.attribute}`);
            attackSuccess = false;
        } else {
            // Should not happen in standard 4-element system if logic covers all
            console.log(`[UNKNOWN] ${attacker.attribute} vs ${target.attribute}`);
            attackSuccess = attacker.level > target.level;
        }
    }
    return attackSuccess;
}

// Test Cases
const tests = [
    // 1. Same Attribute Tests
    { att: { attribute: '木', level: 2 }, tar: { attribute: '木', level: 1 }, expected: true, desc: 'Wood Lv2 vs Wood Lv1' },
    { att: { attribute: '木', level: 1 }, tar: { attribute: '木', level: 2 }, expected: false, desc: 'Wood Lv1 vs Wood Lv2' },
    { att: { attribute: '木', level: 2 }, tar: { attribute: '木', level: 2 }, expected: false, desc: 'Wood Lv2 vs Wood Lv2 (Same Level)' },

    { att: { attribute: '雷', level: 2 }, tar: { attribute: '雷', level: 1 }, expected: true, desc: 'Thunder Lv2 vs Thunder Lv1' },
    { att: { attribute: '雷', level: 1 }, tar: { attribute: '雷', level: 2 }, expected: false, desc: 'Thunder Lv1 vs Thunder Lv2' },
    { att: { attribute: '雷', level: 2 }, tar: { attribute: '雷', level: 2 }, expected: false, desc: 'Thunder Lv2 vs Thunder Lv2' },

    // 2. Thunder vs Others
    { att: { attribute: '雷', level: 0 }, tar: { attribute: '水', level: 3 }, expected: true, desc: 'Thunder vs Water' },
    { att: { attribute: '火', level: 0 }, tar: { attribute: '雷', level: 3 }, expected: true, desc: 'Fire vs Thunder' },

    // 3. Standard Triangle
    { att: { attribute: '木', level: 0 }, tar: { attribute: '水', level: 3 }, expected: true, desc: 'Wood vs Water (Advantage)' },
    { att: { attribute: '水', level: 3 }, tar: { attribute: '木', level: 0 }, expected: false, desc: 'Water vs Wood (Disadvantage)' },
];

let failed = 0;
tests.forEach(t => {
    const result = resolveAttack(t.att, t.tar);
    const pass = result === t.expected;
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${t.desc} -> Result: ${result}, Expected: ${t.expected}`);
    if (!pass) failed++;
});

if (failed === 0) console.log("\nAll tests passed!");
else console.log(`\n${failed} tests failed.`);
