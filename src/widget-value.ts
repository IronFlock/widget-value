import { html, css, LitElement, PropertyValueMap, PropertyValues } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { customElement, property, query, state } from 'lit/decorators.js'
import { ValueDisplayConfiguration } from './definition-schema.js'

type Dataseries = Exclude<ValueDisplayConfiguration['dataseries'], undefined>[number] & { needleValue?: number }
type Data = Exclude<Dataseries['data'], undefined>[number]
type Theme = {
    theme_name: string
    theme_object: any
}

// No locale and no time zone given: both are the viewer's own.
const localDateTime = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
})

// A bound timestamp column arrives as epoch milliseconds; a string column or a
// static subtitle may hold ISO 8601 instead. Anything else is not a point in
// time and comes back undefined, so the caller can show it as given.
const toDate = (value: unknown): Date | undefined => {
    if (value === null || value === undefined || value === '') return undefined
    const ms = /^\s*-?\d+(\.\d+)?\s*$/.test(String(value)) ? Number(value) : Date.parse(String(value))
    return Number.isFinite(ms) ? new Date(ms) : undefined
}

@customElement('widget-value-versionplaceholder')
export class WidgetValue extends LitElement {
    @property({ type: Object })
    inputData?: ValueDisplayConfiguration

    @property({ type: Object })
    theme?: Theme

    @state()
    private dataSets: Map<string, Dataseries> = new Map()

    @state()
    private textActive: boolean = true

    @state() private themeTitleColor?: string
    @state() private themeSubtitleColor?: string

    @query('.value-container')
    valueContainer?: HTMLDivElement

    @query('.sizing-container')
    sizingContainer?: HTMLDivElement

    version: string = 'versionplaceholder'

    private resizeObserver: ResizeObserver
    private lastLargerWidthTime?: number
    private origWidth: number = 0
    private origHeight: number = 0

    constructor() {
        super()
        this.resizeObserver = new ResizeObserver(this.applyData.bind(this))
        this.resizeObserver.observe(this)
    }

    disconnectedCallback() {
        super.disconnectedCallback()
        if (this.resizeObserver) {
            this.resizeObserver.disconnect()
        }
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>) {
        this.registerTheme(this.theme)
    }

    protected update(changedProperties: PropertyValues): void {
        if (changedProperties.has('inputData')) {
            this.transformData()
        }
        super.update(changedProperties)
    }

    protected updated(changedProperties: Map<string, any>) {
        if (changedProperties.has('inputData')) {
            this.sizingSetup()
            this.applyData()
        }

        if (changedProperties.has('theme')) {
            this.registerTheme(this.theme)
        }

        super.updated(changedProperties)
    }

    registerTheme(theme?: Theme) {
        // The host's --re-tile-background-color / --re-text-color are not read
        // through getComputedStyle here. That snapshots them, and this only runs
        // on a `theme` property change, so a board style edit — which changes the
        // custom property and nothing else — left the tile painting the previous
        // colour until it was reloaded. What these fields hold is a var() chain
        // with the theme's own colour as the fallback, so the host property keeps
        // winning over the theme, and the browser resolves it on every repaint
        // without the widget being told anything.
        const themeBg = this.theme?.theme_object?.backgroundColor
        const themeText = this.theme?.theme_object?.title?.textStyle?.color
        const themeSubtext = this.theme?.theme_object?.title?.subtextStyle?.color || themeText

        this.themeTitleColor = `var(--re-text-color, ${themeText ?? 'inherit'})`
        this.themeSubtitleColor = `var(--re-text-color, ${themeSubtext ?? 'inherit'})`
    }

    subTitleText() {
        const subTitle = this.inputData?.subTitle
        if (this.inputData?.subTitleType !== 'timestamp') return subTitle
        const date = toDate(subTitle)
        return date ? localDateTime.format(date) : subTitle
    }

    sizingSetup() {
        const boxes = Array.from(
            this.sizingContainer?.querySelectorAll('.single-value') as NodeListOf<HTMLDivElement>
        )

        let width = 0
        let height = 0
        for (const box of boxes) {
            const dims = box.getBoundingClientRect()
            width = Math.max(dims.width, width)
            height = Math.max(dims.height, height)
        }

        if (width < this.origWidth) {
            if (!this.lastLargerWidthTime || Date.now() - this.lastLargerWidthTime > 5000) {
                this.origWidth = width
            }
        } else {
            this.origWidth = width
            this.lastLargerWidthTime = Date.now()
        }
        this.origHeight = height
    }

    applyData() {
        if (!this.valueContainer) return
        const userWidth = this.valueContainer.getBoundingClientRect().width
        const userHeight = this.valueContainer.getBoundingClientRect().height
        const count = this.dataSets.size

        const width = this.origWidth
        const height = this.origHeight
        if (!userWidth || !userHeight || !width || !height) return

        const fits = []
        for (let c = 1; c <= count; c++) {
            const r = Math.ceil(count / c)
            const uwgap = userWidth - 12 * (c - 1)
            const uhgap = userHeight - 12 * (r - 1)
            const m = uwgap / width / c
            const size = m * m * width * height * count
            if (r * m * height <= uhgap) fits.push({ r, c, m, size, width, height, userWidth, userHeight })
        }

        for (let r = 1; r <= count; r++) {
            const c = Math.ceil(count / r)
            const uwgap = userWidth - 12 * (c - 1)
            const uhgap = userHeight - 12 * (r - 1)
            const m = uhgap / height / r
            const size = m * m * width * height * count
            if (c * m * width <= uwgap) fits.push({ r, c, m, size, width, height, userWidth, userHeight })
        }
        const maxSize = fits.reduce((p, c) => (c.size < p ? p : c.size), 0)
        const fit = fits.find((f) => f.size === maxSize)
        if (!fit) return
        const modifier = fit.m ?? 1
        // console.log('FITS', fits, 'modifier', modifier, 'cols',fit?.c, 'rows', fit?.r, 'new size', fit?.size.toFixed(0), 'total space', (userWidth* userHeight).toFixed(0))
        const boxes = Array.from(
            this.valueContainer?.querySelectorAll('.single-value') as NodeListOf<HTMLDivElement>
        )
        this.valueContainer.style.gridTemplateColumns = `repeat(${fit.c}, 1fr)`

        for (const box of boxes) {
            box.setAttribute(
                'style',
                `width:${modifier * width}px; height:${modifier * height}px; padding:${modifier * 6}px`
            )

            const label: string | null = box.getAttribute('label')
            const ds: Dataseries | undefined = this.dataSets.get(label ?? '')

            const labelText = box.querySelector('.label') as HTMLDivElement
            labelText.setAttribute(
                'style',
                `font-size: ${26 * modifier}px; 
                color: ${ds?.styling?.labelColor || this.themeTitleColor};`
            )
            const numberText = box.querySelector('.current-value') as HTMLDivElement
            numberText.setAttribute(
                'style',
                `font-size: ${32 * modifier}px; 
                color: ${ds?.styling?.valueColor || this.theme?.theme_object?.color?.[0] || this.themeTitleColor};`
            )

            const unitText = box.querySelector('.unit') as HTMLDivElement
            unitText.setAttribute('style', `font-size: ${26 * modifier}px;`)
        }

        this.textActive = true
    }

    async transformData() {
        if (!this.inputData) return
        this.dataSets.forEach((d) => {
            d.label ??= ''
        })
        this.dataSets = new Map()
        this.inputData?.dataseries
            // ?.sort((a, b) => a.order - b.order)
            ?.forEach((ds) => {
                // pivot data
                const distincts = ds.multiChart
                    ? ([...new Set(ds.data?.map((d: Data) => d.pivot))].sort() as string[])
                    : ['']

                distincts.forEach((piv) => {
                    const prefix = piv ?? ''
                    const label = ds.label ?? ''
                    const pds: Dataseries = {
                        label: prefix + (!!prefix && !!label ? ' - ' : '') + label,
                        order: ds.order,
                        unit: ds.unit,
                        precision: ds.precision,
                        advanced: ds.advanced,
                        styling: ds.styling,
                        multiChart: ds.multiChart,
                        value: ds.value,
                        data: distincts.length === 1 ? ds.data : ds.data?.filter((d) => d.pivot === piv),
                        needleValue: undefined
                    }
                    this.dataSets.set(pds.label ?? '', pds)
                })
            })

        // filter latest values and calculate average
        this.dataSets.forEach((ds, label) => {
            ds.advanced ??= {}
            // Fall back to 1 only when the setting is missing or NaN. The
            // inverted guard this replaces reset every VALID number to 1, so
            // averageLatest never averaged anything (widget-gauge has the
            // correct form).
            if (typeof ds.advanced?.averageLatest !== 'number' || isNaN(ds.advanced?.averageLatest))
                ds.advanced.averageLatest = 1

            if (!ds.multiChart) {
                ds.needleValue =
                    ds.value === undefined || ds.value === null ? undefined : Number(ds.value)
            } else {
                const data = ds?.data?.slice(-ds?.advanced?.averageLatest || -1) ?? []
                const values = (data
                    ?.map((d) => d.value)
                    ?.filter((p) => p !== undefined)
                    ?.map(Number) ?? []) as number[]
                ds.needleValue = values.reduce((p, c) => p + c, 0) / values.length
                // Check age of data Latency. The newest row sits at the END of the
                // data array (like the gauge); rows without a parseable tsp opt out.
                const tsp = Date.parse(data?.[data.length - 1]?.tsp ?? '')
                if (!isNaN(tsp)) {
                    const now = new Date().getTime()
                    if (now - tsp > (ds.advanced?.maxLatency ?? Infinity) * 1000) ds.needleValue = undefined
                }
            }
        })
    }

    static styles = css`
        :host {
            display: block;
            font-family: sans-serif;
            box-sizing: border-box;
            position: relative;
            margin: auto;
            overflow: hidden;
            container-type: size;
        }

        .paging:not([active]) {
            display: none !important;
        }

        .wrapper {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
            padding: 2cqh 2cqw;
            box-sizing: border-box;
        }

        h3 {
            margin: 0;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        p {
            margin: 10px 0 0 0;
            max-width: 300px;
            font-size: 14px;
            line-height: 17px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .value-container {
            display: grid;
            line-height: 0.9;
            flex: 1;
            overflow: hidden;
            position: relative;
            gap: 12px;
        }

        .single-value {
            overflow: hidden;
            position: relative;
            align-items: end;
            padding: 6px;
            box-sizing: border-box;
        }

        .current-value {
            font-size: 32px;
            font-weight: 600;
            white-space: nowrap;
        }

        .label,
        .unit {
            font-weight: 300;
            font-size: 26px;
            white-space: nowrap;
        }

        .sizing-container {
            position: absolute;
            left: 100000px;
            line-height: 0.9;
            overflow: hidden;
            gap: 12px;
        }

        .no-data {
            font-size: 20px;
            display: flex;
            height: 100%;
            width: 100%;
            text-align: center;
            align-items: center;
            justify-content: center;
        }
    `

    render() {
        return html`
            <div class="wrapper" style="color: ${this.themeTitleColor}">
                <header>
                    <h3 class="paging" ?active=${this.inputData?.title}>${this.inputData?.title}</h3>
                    <p
                        class="paging"
                        ?active=${this.inputData?.subTitle}
                        style="color: ${this.themeSubtitleColor}"
                    >
                        ${this.subTitleText()}
                    </p>
                </header>
                <div class="sizing-container">
                    ${repeat(
                        this.dataSets,
                        ([label]) => label,
                        ([label, ds]) => {
                            return html`
                                <div class="single-value" label="${label}">
                                    <div class="label paging" ?active=${this.textActive}>${label}</div>
                                    <span
                                        class="current-value paging"
                                        ?active=${this.textActive}
                                        style="color: ${ds?.styling?.valueColor ||
                                        this.theme?.theme_object?.color?.[0] ||
                                        this.themeTitleColor}"
                                    >
                                        ${ds.needleValue === undefined ||
                                        ds.needleValue === null ||
                                        isNaN(ds.needleValue)
                                            ? ''
                                            : ds.needleValue.toFixed(Math.max(0, ds.precision ?? 0))}
                                        <span class="unit paging" ?active=${this.textActive}>${ds.unit}</span>
                                    </span>
                                </div>
                            `
                        }
                    )}
                </div>
                <div class="paging no-data" ?active=${!this.dataSets.size}>No Data</div>
                <div class="value-container">
                    ${repeat(
                        [...this.dataSets.entries()].sort(),
                        ([label]) => label,
                        ([label, ds]) => {
                            return html`
                                <div class="single-value" label="${label}">
                                    <div
                                        class="label paging"
                                        style="color: ${ds?.styling?.labelColor || this.themeTitleColor}"
                                        ?active=${this.textActive}
                                    >
                                        ${label}
                                    </div>
                                    <span
                                        class="current-value paging"
                                        ?active=${this.textActive}
                                        style="color: ${ds?.styling?.valueColor ||
                                        this.theme?.theme_object?.color?.[0] ||
                                        this.themeTitleColor}"
                                    >
                                        ${ds.needleValue === undefined ||
                                        ds.needleValue === null ||
                                        isNaN(ds.needleValue)
                                            ? ''
                                            : ds.needleValue.toFixed(Math.max(0, ds.precision ?? 0))}
                                        <span class="unit paging" ?active=${this.textActive}>${ds.unit}</span>
                                    </span>
                                </div>
                            `
                        }
                    )}
                </div>
            </div>
        `
    }
}
