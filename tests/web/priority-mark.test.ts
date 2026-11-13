/**
 * The priority stripe (HKU3, D450) – where it stands. The priorities' colours are the categories' colours too, so on the tile of a
 * block the stripe stands 2 px away from the edge of the category (the gap is the tile's own background): the same colour on both
 * sides leaves two stripes, not one thick edge. In a row and a chip it lies against the left edge as before.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PriorityMark } from '@renderer/features/cases/PriorityMark'

const classesOf = (props: Parameters<typeof PriorityMark>[0]): string[] => (/class="([^"]*)"/.exec(renderToStaticMarkup(createElement(PriorityMark, props)))?.[1] ?? '').split(' ')

describe('pasek priorytetu – odstęp od krawędzi kategorii', () => {
  it('na kafelku bloku (`apart`) stoi 2 px od krawędzi, nie przy niej', () => {
    const c = classesOf({ priority: 'p3', apart: true, testId: 'block-priority' })
    expect(c).toContain('left-[2px]')
    expect(c).not.toContain('left-0')
    expect(c).toContain('w-[3px]')
  })

  it('w wierszu i na chipie – przy lewej krawędzi, jak dotąd', () => {
    const c = classesOf({ priority: 'p3' })
    expect(c).toContain('left-0')
    expect(c).not.toContain('left-[2px]')
  })
})
