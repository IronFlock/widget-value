# \<widget-value>

This webcomponent follows the [open-wc](https://github.com/open-wc/open-wc) recommendation.

## Installation

```bash
npm i @ironflock/widget-value
```

## Usage

```html
<script type="module">
    import '@ironflock/widget-value/widget-value.js'
</script>

<widget-value-1.1.24></widget-value-1.1.24>
```

## Expected data format

Please take a look at the src/default-data.json to see what data is expected to make the widget show content.

The following format represents the available data :

```js
data: {
  settings: {
    title: string,
    subTitle: string,
    minGauge: number,
    maxGauge: number,
    style: {
      needleColor: string,
      sections: number,
      backgroundColor: string[]
    }
  }
  gaugeValue: Number
}
```

## Local Demo

```bash
npm start
```

To run a local development server that serves the basic demo located in `demo/index.html`
