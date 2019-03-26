import { List } from 'immutable'
import toOpenApiSchema from 'json-schema-to-openapi-schema'
import { MetadataKey, ParamMetadata, ResponseMetadata } from 'luren'
import { IMediaType, IParameter, IRequestBody, IResponse } from './swagger'

const isFileType = (schema: any) => {
  return schema.type === 'string' && schema.format === 'binary'
}

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
  for (const paramMetadata of paramsMetadata) {
    if (paramMetadata.source === 'body') {
      if (isFileType(paramMetadata.schema)) {
        if (paramMetadata.root) {
          content = paramMetadata.mime || 'application/octet-stream'
        } else {
          content = 'multipart/form-data'
          schema.properties[paramMetadata.name] = paramMetadata.schema
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

export const getResponses = (ctrl: object, prop) => {
  const responsesMetadata: Map<number, ResponseMetadata> = Reflect.getMetadata(MetadataKey.RESPONSE, ctrl, prop)
  const responses: { [code: string]: IResponse } = {}
  for (const [statusCode, resMetadata] of responsesMetadata) {
    const response: IResponse = {} as any
    const res: IMediaType = {} as any
    let contentType = 'application/json'

    if (isFileType(resMetadata.schema)) {
      contentType = resMetadata.schema.mime || 'application/octet-stream'
    }
    res.schema = toOpenApiSchema(resMetadata.schema)
    response.content = { [contentType]: res }
    responses[statusCode] = response
  }
  return responses
}
