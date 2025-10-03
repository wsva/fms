import CryptoJS from "crypto-js";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { v4 as uuidv4 } from "uuid";

export const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export const formatDateString = (dateString: string) => {
    const date = new Date(dateString);
    return formatDate(date);
}

export const getWordUserUUID = (user_id: string, language: string, word: string) => {
    return CryptoJS.MD5(user_id + language + word).toString()
}

export const getUUID = () => {
    return uuidv4().replaceAll('-', '')
}

export const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export const strJoin = (strList: string[]) => {
    return strList.join(', ')
}

export const strSplit = (str: string) => {
    return str.split(', ')
}

export function getProperty<T, K extends keyof T>(o: T, propertyName: K): T[K] {
    return o[propertyName]; // o[propertyName] is of type T[K]
}

export const checkSQLSafe = (str: string) => {
    return !!str.match(/^[^'"=]+$/)
}

export const getHTML = (content: string) => {
    return DOMPurify.sanitize(marked.parse(content, {
        async: false,
        pedantic: false,
        gfm: true,
    }))
}

export const sleep = async (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// https://stackoverflow.com/questions/43566019/how-to-choose-a-weighted-random-array-element-in-javascript
export const getWeightedRandom = (weights: number[]) => {
    let i = 0
    for (i = 1; i < weights.length; i++)
        weights[i] += weights[i - 1];
    const random = Math.random() * weights[weights.length - 1];
    for (i = 0; i < weights.length; i++)
        if (weights[i] > random)
            break;
    return i
}

export const indentJsonString = (jsonStr: string, spaces: number = 2): string => {
    try {
        const obj = JSON.parse(jsonStr);
        return JSON.stringify(obj, null, spaces);
    } catch (e) {
        console.error("Invalid JSON string:", e);
        return jsonStr; // 如果不是合法 JSON，原样返回
    }
}

/**
 * 类型收缩，裁剪掉额外字段
 */
export function toExactType<T>(obj: any): T {
    const keys = Object.keys(obj) as (keyof T)[];
    const result: Partial<T> = {};
    for (const key of keys) {
        if (key in obj) result[key] = obj[key];
    }
    return result as T;
}