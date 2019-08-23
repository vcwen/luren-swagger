import { List } from 'immutable'
import _ from 'lodash'
import { AuthenticationType, HttpStatusCode, MetadataKey, ParamMetadata, ResponseMetadata } from 'luren'
import { JsTypes } from 'luren-schema'
import AuthenticationProcessor, { APITokenAuthentication } from 'luren/dist/lib/Authentication'
import { IMediaType, IParameter, IRequestBody, IResponse } from './swagger'
// tslint:disable-next-line: no-var-requires
const toOpenApiSchema = require('json-schema-to-openapi-schema')

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
          const propSchema = JsTypes.toJsonSchema(paramMetadata.schema.properties[prop])
          const param: IParameter = {
            name: paramMetadata.name,
            in: paramMetadata.source,
            required: requiredProps.includes(prop),
            schema: toOpenApiSchema(propSchema)
          }
          params.push(param)
        }
        return params
      } else {
        throw new TypeError("Parameter's type must be 'object' when it's root")
      }
    } else {
      const schema = JsTypes.toJsonSchema(paramMetadata.schema)
      const param: IParameter = {
        name: paramMetadata.name,
        in: paramMetadata.source,
        required: paramMetadata.required,
        schema: toOpenApiSchema(schema),
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
  let schema: any = { type: 'object', properties: {}, required: [] }
  const bodyParamsMetadata = paramsMetadata.filter((metadata) => metadata.source === 'body')
  if (!bodyParamsMetadata.isEmpty()) {
    for (const paramMetadata of bodyParamsMetadata) {
      if (paramMetadata.source === 'body') {
        if (paramMetadata.schema.type === 'file') {
          if (paramMetadata.root) {
            content = paramMetadata.mime || 'application/octet-stream'
          } else {
            content = 'multipart/form-data'
          }
        }
        if (paramMetadata.root) {
          schema = JsTypes.toJsonSchema(paramMetadata.schema)
          break
        } else {
          if (paramMetadata.required) {
            schema.required.push(paramMetadata.name)
          }
          schema.properties[paramMetadata.name] = JsTypes.toJsonSchema(paramMetadata.schema)
        }
      }
    }
    body.content = { [content]: { schema: toOpenApiSchema(schema) } }
    return body
  }
}

const normalizeResponseSchema = (schema: any): any => {
  if (schema.jsonType) {
    schema.type = schema.jsonType
  } else {
    if (schema.type === 'object') {
      if (!_.isEmpty(schema.properties)) {
        const props = Object.getOwnPropertyNames(schema.properties)
        for (const prop of props) {
          const propSchema = schema.properties[prop]
          normalizeResponseSchema(propSchema)
          if (propSchema.name) {
            Reflect.set(schema.properties, propSchema.name, propSchema)
            Reflect.deleteProperty(schema.properties, prop)
          }
        }
      }
    } else if (schema.type === 'array' && !_.isEmpty(schema.items)) {
      normalizeResponseSchema(schema.items)
    }
  }
  return schema
}

export const getResponses = (ctrl: object, prop: string) => {
  const responsesMetadata: Map<number, ResponseMetadata> = Reflect.getMetadata(MetadataKey.RESPONSE, ctrl, prop)
  const responses: { [code: string]: IResponse } = {}
  if (responsesMetadata) {
    for (const [statusCode, resMetadata] of responsesMetadata) {
      const response: IResponse = {} as any
      const res: IMediaType = {} as any
      const contentType = resMetadata.mime || 'application/json'
      const schema = JsTypes.toJsonSchema(resMetadata.schema)
      res.schema = toOpenApiSchema(schema)
      response.content = { [contentType]: res }
      responses[statusCode] = response
    }
  } else {
    responses[HttpStatusCode.OK] = { description: 'successful operation' }
  }

  return responses
}

export const authenticationProcessorToSecuritySchema = (processor: AuthenticationProcessor): any => {
  switch (processor.type) {
    case AuthenticationType.API_TOKEN:
      const p = processor as APITokenAuthentication
      return { type: 'apiKey', name: p.key, in: p.source }
    default:
      return undefined
  }
}
