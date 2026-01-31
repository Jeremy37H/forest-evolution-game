import { ref, computed } from 'vue';
import gameApi from '../services/gameApi';

export function useSkills(game, player, apiUrl, addLogMessage) {
    const skillTargetSelection = ref({
        active: false,
        skill: '',
        maxTargets: 0,
        targets: [],
        targetAttribute: null,
        oneTime: false,
        needsAttribute: false
    });

    const isOneTimeSkillUsed = (skill) => {
        return player.value && player.value.usedOneTimeSkills && player.value.usedOneTimeSkills.includes(skill);
    };

    const isSkillAvailable = (skill) => {
        if (!player.value || !game.value) return false;

        const passiveSkills = ['基因改造', '適者生存', '尖刺', '嗜血', '龜甲', '兩棲', '禿鷹', '斷尾'];
        if (passiveSkills.includes(skill)) return false;

        const discussionOneTimeSkills = ['寄生', '擬態'];
        if (discussionOneTimeSkills.includes(skill)) {
            if (isOneTimeSkillUsed(skill)) return false;
            return game.value.gamePhase?.startsWith('discussion');
        }

        if (skill === '森林權杖') {
            if (isOneTimeSkillUsed(skill)) return false;
            return game.value.gamePhase?.startsWith('attack');
        }

        const discussionSkills = ['劇毒', '荷魯斯之眼', '冬眠', '瞪人', '獅子王', '折翅'];
        if (discussionSkills.includes(skill)) {
            if (!game.value.gamePhase?.startsWith('discussion')) return false;
            if (skill === '冬眠') return !(player.value.roundStats?.isHibernating);
            if (skill === '獅子王') return !player.value.roundStats?.minionId;
            if (skill === '折翅') return !isOneTimeSkillUsed(skill);
            return !player.value.roundStats?.usedSkillsThisRound?.includes(skill);
        }

        if (skill === '腎上腺素') {
            return player.value.hp < 10;
        }

        return false;
    };

    const hasActiveSkills = computed(() => {
        if (!player.value) return false;
        const activeSkills = ['冬眠', '瞪人', '擬態', '寄生', '森林權杖', '獅子王', '折翅', '腎上腺素'];
        return player.value.skills.some(s => activeSkills.includes(s) && isSkillAvailable(s));
    });

    const useSkill = async (skill, targets = [], targetAttribute = null) => {
        if (!player.value) return;
        try {
            const response = await gameApi.useSkill({
                playerId: player.value._id,
                skill,
                targets,
                targetAttribute
            });
            addLogMessage(response.data.message, 'system');
        } catch (error) {
            addLogMessage(error.response?.data?.message || '使用技能時發生錯誤', 'error');
        }
    };

    const handleSkillClick = (skill, targetId = null) => {
        const targetSelectionSkills = ['瞪人', '寄生', '森林權杖', '獅子王', '擬態', '折翅'];
        const directTargetSkills = ['劇毒', '荷魯斯之眼'];
        const oneTimeSkills = ['寄生', '森林權杖', '擬態', '折翅'];

        if (oneTimeSkills.includes(skill) && isOneTimeSkillUsed(skill)) {
            return addLogMessage(`[${skill}] 技能只能使用一次`, 'error');
        }

        if (directTargetSkills.includes(skill) && targetId) {
            useSkill(skill, [targetId]);
            return;
        }

        if (targetSelectionSkills.includes(skill) && !targetId) {
            let maxTargets = 1;
            let needsAttribute = false;
            if (skill === '瞪人') maxTargets = 2;
            if (skill === '森林權杖') needsAttribute = true;

            skillTargetSelection.value = {
                active: true,
                skill,
                maxTargets,
                targets: [],
                needsAttribute,
                targetAttribute: null,
                oneTime: oneTimeSkills.includes(skill)
            };
            return;
        }

        if (skill === '冬眠') {
            // 這個由外部處理彈窗，或在 App.vue 呼叫 executeHibernate
            return 'SHOW_HIBERNATE_MODAL';
        }
    };

    const confirmSkillTargets = () => {
        const sel = skillTargetSelection.value;
        if (sel.needsAttribute && !sel.targetAttribute) return addLogMessage('請選擇一個目標屬性！', 'error');
        if (!sel.needsAttribute && sel.targets.length === 0) return addLogMessage('請至少選擇一位目標！', 'error');

        const targets = sel.needsAttribute ? [sel.targetAttribute] : sel.targets;
        const targetAttribute = sel.needsAttribute ? sel.targetAttribute : null;
        useSkill(sel.skill, targets, targetAttribute);
        cancelSkillSelection();
    };

    const cancelSkillSelection = () => {
        skillTargetSelection.value = { active: false, skill: '', maxTargets: 0, targets: [], targetAttribute: null };
    };

    const toggleSkillTarget = (targetId) => {
        const sel = skillTargetSelection.value;
        const index = sel.targets.indexOf(targetId);
        if (index > -1) {
            sel.targets.splice(index, 1);
        } else {
            if (sel.targets.length < sel.maxTargets) {
                sel.targets.push(targetId);
            } else {
                addLogMessage(`最多只能選擇 ${sel.maxTargets} 個目標`, 'error');
            }
        }
    };

    return {
        skillTargetSelection,
        isOneTimeSkillUsed,
        isSkillAvailable,
        hasActiveSkills,
        useSkill,
        handleSkillClick,
        confirmSkillTargets,
        cancelSkillSelection,
        toggleSkillTarget
    };
}
