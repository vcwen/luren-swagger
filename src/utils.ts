import { List } from 'immutable'
import toOpenApiSchema from 'json-schema-to-openapi-schema'
import { MetadataKey, ParamMetadata, ResponseMetadata } from 'luren'
import { IMediaType, IParameter, IRequestBody, IResponse } from './swagger'

export const getParams = (ctrl: object, propKey: string) => {
  const paramsMetadata: List<ParamMetadata> = Reflect.getMetadata(MetadataKey.PARAMS, ctrl, propKey)
  if (!paramsMetadata) {
    return []
  }
  let params: IParameter[] = []
  for (const paramMetadata of paramsMetadata) {
    if (paramMetadata.source === 'context' || paramMetadata.source === 'body') {
      continue
    }
    if (paramMetadata.root) {
      params = []
      if (paramMetadata.schema.properties) {
        const props = Object.getOwnPropertyNames(paramMetadata.schema.properties)
        const requiredProps = paramMetadata.schema.required || []
        for (const prop of props) {
          const param: IParameter = {
            name: paramMetadata.name,
            in: paramMetadata.source,
            required: requiredProps.includes(prop),
            schema: toOpenApiSchema(paramMetadata.schema.properties[prop])
          }
          params.push(param)
        }
        return params
      } else {
        throw new TypeError("Parameter's type must be 'object' when it's root")
      }
    } else {
      const param: IParameter = {
        name: paramMetadata.name,
        in: paramMetadata.source,
        required: paramMetadata.required,
        schema: paramMetadata.schema,
        description: paramMetadata.desc
      }
      params.push(param)
    }
  }
  return params
}

export const getRequestBody = (ctrl: object, prop: string) => {
  const paramsMetadata: List<ParamMetadata> = Reflect.getMetadata(MetadataKey.PARAMS, ctrl, prop)
  if (!paramsMetadata) {
    return {} as any
  }
  const body: IRequestBody = { content: {} }
  let content = 'application/json'
  let schema: any = { type: 'object', properties: {} }
  const bodyParamsMetadata = paramsMetadata.filter((metadata) => metadata.source === 'body')
  if (!bodyParamsMetadata.isEmpty()) {
    for (const paramMetadata of bodyParamsMetadata) {
      if (paramMetadata.source === 'body') {
        if (paramMetadata.isFile) {
          if (paramMetadata.root) {
            content = paramMetadata.mime || 'application/octet-stream'
          } else {
            content = 'multipart/form-data'
            schema.properties[paramMetadata.name] = { type: 'string', format: 'binary' }
          }
        } else {
          if (paramMetadata.root) {
            schema = paramMetadata.schema
          } else {
            schema.properties[paramMetadata.name] = paramMetadata.schema
          }
        }
      }
    }
    body.content = { [content]: { schema: toOpenApiSchema(schema) } }
    return body
  }
}

export const getResponses = (ctrl: object, prop) => {
  const responsesMetadata: Map<number, ResponseMetadata> = Reflect.getMetadata(MetadataKey.RESPONSE, ctrl, prop)
  const responses: { [code: string]: IResponse } = {}
  for (const [statusCode, resMetadata] of responsesMetadata) {
    const response: IResponse = {} as any
    const res: IMediaType = {} as any
    let contentType = 'application/json'
    let schema = resMetadata.schema
    if (resMetadata.isStream) {
      contentType = resMetadata.mime || 'application/octet-stream'
      schema = { type: 'string', format: 'binary' }
    }
    res.schema = toOpenApiSchema(schema)
    response.content = { [contentType]: res }
    responses[statusCode] = response
  }
  return responses
}
