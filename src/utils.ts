import { List } from 'immutable'
import _ from 'lodash'
import { AuthenticationType, HttpStatusCode, MetadataKey, ParamMetadata, ResponseMetadata } from 'luren'
import { JsTypes } from 'luren-schema'
import AuthenticationProcessor, { APITokenAuthentication, HTTPAuthentication } from 'luren/dist/lib/Authentication'

import { IMediaType, IParameter, IRequestBody, IResponse } from './swagger'
// tslint:disable-next-line: no-var-requires
const toOpenApiSchema = require('json-schema-to-openapi-schema')

// tslint:disable-next-line: no-var-requires
const yaml = require('json-to-pretty-yaml')

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
            schema: toOpenApiSchema(propSchema),
            description: paramMetadata.desc
          }
          if (paramMetadata.example) {
            param.example = paramMetadata.example
          }
          params.push(param)
        }
        return params
      } else {
        throw new TypeError("Parameter's type must be 'object' when it's root")
      }
    } else {
      const schema = toOpenApiSchema(JsTypes.toJsonSchema(paramMetadata.schema))

      const param: IParameter = {
        name: paramMetadata.name,
        in: paramMetadata.source,
        required: paramMetadata.required,
        schema,
        description: paramMetadata.desc
      }
      if (paramMetadata.example) {
        param.example = paramMetadata.example
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
    let bodyDesc: string[] = []
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
          if (paramMetadata.example) {
            schema.example = paramMetadata.example
          }
          if (paramMetadata.desc) {
            bodyDesc = [paramMetadata.desc]
          }
          break
        } else {
          if (paramMetadata.required) {
            schema.required.push(paramMetadata.name)
          }
          schema.properties[paramMetadata.name] = JsTypes.toJsonSchema(paramMetadata.schema)
          if (paramMetadata.example) {
            schema.properties[paramMetadata.name].example = paramMetadata.example
          }
          if (paramMetadata.desc) {
            bodyDesc.push(`<strong>${paramMetadata.name}</strong>: ${paramMetadata.desc}`)
          }
        }
      }
    }
    body.content = { [content]: { schema: toOpenApiSchema(schema) } }
    body.description = bodyDesc.join('<br/>')
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
      const contentType =
        resMetadata.headers && resMetadata.headers['Content-Type']
          ? resMetadata.headers['Content-Type']
          : 'application/json'
      const schema = JsTypes.toJsonSchema(resMetadata.schema)
      res.schema = toOpenApiSchema(schema)
      if (resMetadata.example) {
        res.example = resMetadata.example
      }
      response.description = resMetadata.desc
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
    case AuthenticationType.API_TOKEN: {
      const p = processor as APITokenAuthentication
      return { type: 'apiKey', name: p.key, in: p.source }
    }

    case AuthenticationType.HTTP: {
      const p = processor as HTTPAuthentication
      return { type: 'http', scheme: p.scheme, bearerFormat: p.bearerFormat }
    }
    default:
      return undefined
  }
}

const stripUndefined = (data: any) => {
  if (data === undefined) {
    return null
  }
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      if (data[i] === undefined) {
        data[i] = null
      } else {
        stripUndefined(data[i])
      }
    }
    return data
  } else if (typeof data === 'object') {
    const props = Object.getOwnPropertyNames(data)
    for (const prop of props) {
      if (data[prop] === undefined) {
        Reflect.deleteProperty(data, prop)
      }
    }
    return data
  } else {
    return data
  }
}

export const toYaml = (data: any) => {
  stripUndefined(data)
  return yaml.stringify(data, { maxDepth: 20, noColor: true })
}
