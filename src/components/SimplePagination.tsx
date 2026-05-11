'use client'

import { Pagination } from "@heroui/react";

type Props = {
    page: number;
    total: number;
    onChange: (page: number) => void;
}

function getPageRange(page: number, total: number): (number | '...')[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const result: (number | '...')[] = [];
    result.push(1);
    if (page > 3) result.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(total - 1, page + 1); i++) {
        result.push(i);
    }
    if (page < total - 2) result.push('...');
    result.push(total);
    return result;
}

export default function SimplePagination({ page, total, onChange }: Props) {
    const pages = getPageRange(page, total);
    return (
        <Pagination>
            <Pagination.Content>
                <Pagination.Item>
                    <Pagination.Previous onPress={() => onChange(page <= 1 ? total : page - 1)}>
                        <Pagination.PreviousIcon />
                    </Pagination.Previous>
                </Pagination.Item>
                {pages.map((p, i) =>
                    p === '...'
                        ? (
                            <Pagination.Item key={`ellipsis-${i}`}>
                                <Pagination.Ellipsis />
                            </Pagination.Item>
                        )
                        : (
                            <Pagination.Item key={p}>
                                <Pagination.Link isActive={p === page} onPress={() => onChange(p as number)}>
                                    {p}
                                </Pagination.Link>
                            </Pagination.Item>
                        )
                )}
                <Pagination.Item>
                    <Pagination.Next onPress={() => onChange(page >= total ? 1 : page + 1)}>
                        <Pagination.NextIcon />
                    </Pagination.Next>
                </Pagination.Item>
            </Pagination.Content>
        </Pagination>
    );
}
