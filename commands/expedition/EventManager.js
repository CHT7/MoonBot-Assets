const fs = require('fs');
const path = require('path');

class EventManager {
    constructor(jsonPath) {
        const rawData = fs.readFileSync(path.resolve(__dirname, jsonPath), 'utf-8');
        this.events = JSON.parse(rawData);
    }

    getEventById(id) {
        return this.events.find(e => e.id === id);
    }

    // Kiểm tra điều kiện xuất hiện
    checkConditions(event, session) {
        if (!event.biomes.includes(session.biome)) return false;
        
        const cond = event.conditions;
        if (cond) {
            if (cond.minDepth && session.depth < cond.minDepth) return false;
            if (cond.maxDepth && session.depth > cond.maxDepth) return false;
            if (cond.requiredFlags?.some(flag => !session.flags[flag])) return false;
            if (cond.forbiddenFlags?.some(flag => session.flags[flag])) return false;
        }
        return true;
    }

    // Tính toán Weight động dựa trên Flags
    calculateDynamicWeight(event, session) {
        let weight = event.baseWeight;
        if (event.weightModifiers) {
            for (const mod of event.weightModifiers) {
                if (session.flags[mod.flag]) {
                    if (mod.multiplier) weight *= mod.multiplier;
                    if (mod.add) weight += mod.add;
                }
            }
        }
        return weight;
    }

    // Roll sự kiện
    rollEventForSession(session) {
        const validEvents = this.events.filter(e => this.checkConditions(e, session));
        if (validEvents.length === 0) return null;

        let totalWeight = 0;
        const weightedEvents = validEvents.map(e => {
            const w = this.calculateDynamicWeight(e, session);
            totalWeight += w;
            return { event: e, weight: w };
        }).filter(e => e.weight > 0);

        let random = Math.random() * totalWeight;
        for (const item of weightedEvents) {
            if (random < item.weight) return item.event;
            random -= item.weight;
        }
        return weightedEvents[0]?.event;
    }

    // Thực thi lựa chọn và áp dụng thay đổi lên Session
    executeChoice(session, choiceData) {
        const isSuccess = Math.random() <= (choiceData.successChance || 1.0);
        const outcome = isSuccess ? choiceData.onSuccess : choiceData.onFail;
        
        if (!outcome) throw new Error(`Missing outcome for choice ${choiceData.id}`);

        const effects = outcome.effects || {};
        
        if (effects.hp) session.modifyHP(effects.hp);
        if (effects.temp) session.modifyTemp(effects.temp);
        if (effects.sanity) session.modifySanity(effects.sanity);
        if (effects.cyan) session.cyan += effects.cyan;
        if (effects.supplies) session.supplies += effects.supplies;
        if (effects.setFlags) {
            Object.keys(effects.setFlags).forEach(k => session.flags[k] = effects.setFlags[k]);
        }

        // Tự động map style string sang Discord ButtonStyle (trong file chính sẽ dùng)
        return {
            description: outcome.description,
            nextActions: outcome.nextActions || ['move', 'camp'] // Hành động mặc định sau khi xong
        };
    }
}

module.exports = EventManager;
